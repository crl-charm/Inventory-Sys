import { describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  fetchWithRetry,
  parseRetryAfter,
  UpstreamUnavailableError,
  type RetryPolicy,
} from "./retry";

const policy: RetryPolicy = {
  maxAttempts: 3,
  timeoutMs: 1000,
  totalBudgetMs: 60_000,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  mode: "replay-safe",
};
const hooks = (fetchImpl: typeof fetch) => ({ fetchImpl, sleep: async () => undefined, random: () => 0.5 });
const res = (status: number, headers: Record<string, string> = {}) => new Response("x", { status, headers });
const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

describe("parseRetryAfter / backoffDelay", () => {
  it("reads seconds and HTTP dates", () => {
    expect(parseRetryAfter("7", 0)).toBe(7000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter("soon", 0)).toBeNull();
    expect(parseRetryAfter(null, 0)).toBeNull();
  });
  it("grows exponentially, stays inside the cap, and is jittered", () => {
    expect(backoffDelay(1, 100, 1000, () => 0)).toBe(50);
    expect(backoffDelay(1, 100, 1000, () => 1)).toBe(100);
    expect(backoffDelay(3, 100, 1000, () => 1)).toBe(400);
    expect(backoffDelay(10, 100, 1000, () => 1)).toBe(1000);
  });
});

describe("fetchWithRetry — safe (replay-safe) requests", () => {
  it.each([502, 503, 504])("retries HTTP %i and then succeeds", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(status)).mockResolvedValueOnce(res(200));
    const response = await fetchWithRetry("http://api/x", {}, policy, hooks(fetchImpl));
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries a transient network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(netError("ECONNRESET")).mockResolvedValueOnce(res(200));
    const response = await fetchWithRetry("http://api/x", {}, policy, hooks(fetchImpl));
    expect(response.status).toBe(200);
  });

  it("stops at maxAttempts and returns the last 5xx response", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => res(503));
    const response = await fetchWithRetry("http://api/x", {}, policy, hooks(fetchImpl));
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("outlasts a burst of instant 5xx responses during a cold start", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls <= 8 ? res(502) : res(200);
    });
    const response = await fetchWithRetry(
      "http://api/x",
      {},
      {
        maxAttempts: 15,
        timeoutMs: 1000,
        totalBudgetMs: 90_000,
        baseDelayMs: 100,
        maxDelayMs: 8000,
        mode: "replay-safe",
      },
      hooks(fetchImpl)
    );
    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(9);
  });

  it("throws UpstreamUnavailableError after repeated network failures", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(netError("ECONNRESET"));
    await expect(fetchWithRetry("http://api/x", {}, policy, hooks(fetchImpl))).rejects.toBeInstanceOf(
      UpstreamUnavailableError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 500])("never retries HTTP %i", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(res(status));
    const response = await fetchWithRetry("http://api/x", {}, policy, hooks(fetchImpl));
    expect(response.status).toBe(status);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("waits at least Retry-After (capped at maxDelayMs)", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(503, { "retry-after": "1" }))
      .mockResolvedValueOnce(res(503, { "retry-after": "3600" }))
      .mockResolvedValueOnce(res(200));
    await fetchWithRetry("http://api/x", {}, policy, {
      fetchImpl,
      random: () => 0,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(sleeps).toEqual([1000, 1000]); // 1 s honoured; 3600 s capped at 1 s
  });

  it("does not retry a response the caller marks as already-exhausted", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(503, { "x-upstream-exhausted": "1" }));
    const response = await fetchWithRetry("http://api/x", {}, policy, {
      ...hooks(fetchImpl),
      shouldRetryResponse: (r) => !r.headers.has("x-upstream-exhausted"),
    });
    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchWithRetry — timeouts and budgets", () => {
  it("aborts a hung attempt at timeoutMs and reports a timeout", async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      )
    ) as unknown as typeof fetch;
    const started = Date.now();
    await expect(
      fetchWithRetry("http://api/x", {}, { ...policy, maxAttempts: 1, timeoutMs: 50 }, hooks(fetchImpl))
    ).rejects.toMatchObject({ name: "UpstreamUnavailableError", kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("respects the total budget (no endless retrying)", async () => {
    let clock = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      clock += 40_000;
      return res(503);
    });
    const response = await fetchWithRetry(
      "http://api/x",
      {},
      { ...policy, maxAttempts: 10, totalBudgetMs: 90_000 },
      { fetchImpl, now: () => clock, sleep: async () => undefined, random: () => 0 }
    );
    expect(response.status).toBe(503);
    expect(fetchImpl.mock.calls.length).toBeLessThan(10);
  });

  it("stops immediately when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(
      fetchWithRetry("http://api/x", { signal: controller.signal }, policy, hooks(fetchImpl))
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchWithRetry — pre-send mode (writes that must not repeat)", () => {
  const writePolicy: RetryPolicy = { ...policy, mode: "pre-send" };

  it("never retries an HTTP error status, even 502/503/504", async () => {
    for (const status of [502, 503, 504]) {
      const fetchImpl = vi.fn().mockResolvedValue(res(status));
      const response = await fetchWithRetry("http://api/x", { method: "POST" }, writePolicy, hooks(fetchImpl));
      expect(response.status).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("never retries an ambiguous failure (reset or timeout)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(netError("ECONNRESET"));
    await expect(
      fetchWithRetry("http://api/x", { method: "POST" }, writePolicy, hooks(fetchImpl))
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does retry when the request provably never left (ECONNREFUSED)", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(netError("ECONNREFUSED")).mockResolvedValueOnce(res(201));
    const response = await fetchWithRetry("http://api/x", { method: "POST" }, writePolicy, hooks(fetchImpl));
    expect(response.status).toBe(201);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
