import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "./[...path]/route";

const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
const ok = () => Response.json({ success: true, data: {} });

function call(handler: typeof GET, method: string, path: string, body?: unknown) {
  const request = new NextRequest(`http://web.test/api/${path}`, {
    method,
    headers: { "content-type": "application/json", origin: "http://web.test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ path: path.split("?")[0]!.split("/") }) });
}

beforeEach(() => {
  vi.stubEnv("BACKEND_URL", "https://api.test");
  vi.stubEnv("UPSTREAM_TIMEOUT_MS", "2000");
  // Keep the failure-path tests fast; the 15-attempt cold-start window is
  // covered by upstream.test.ts / retry.test.ts.
  vi.stubEnv("UPSTREAM_MAX_ATTEMPTS", "4");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("API proxy", () => {
  it("calls the configured backend URL, not localhost", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);
    await call(GET, "GET", "products?page=2");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.test/api/products?page=2");
  });

  it("retries a GET through 503 → 503 → 200", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>waking</html>", { status: 503, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("<html>waking</html>", { status: 503, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(GET, "GET", "dashboard");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("turns a permanent HTML 502 into a JSON BACKEND_UNAVAILABLE envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response("<html>bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } })));
    const response = await call(GET, "GET", "dashboard");
    expect(response.status).toBe(503);
    expect(response.headers.get("x-upstream-exhausted")).toBe("1");
    const body = await response.json();
    expect(body.error.code).toBe("BACKEND_UNAVAILABLE");
  });

  it("returns a JSON error (not an HTML 500) when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(netError("ECONNRESET")));
    const response = await call(GET, "GET", "dashboard");
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("BACKEND_UNAVAILABLE");
  });

  it("sends stock-in exactly once even when the API answers 503", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ success: false, error: { code: "DATABASE_UNAVAILABLE", message: "x" } }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(POST, "POST", "stock-movements/stock-in", { productId: 1, quantity: "5" });
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a void exactly once after a connection reset", async () => {
    const fetchMock = vi.fn().mockRejectedValue(netError("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(POST, "POST", "sales/9/void", {});
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a write only when it provably never reached the API", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(netError("ECONNREFUSED")).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(POST, "POST", "stock-movements/stock-in", { productId: 1, quantity: "5" });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a sale that carries a requestId (the API de-duplicates it)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("", { status: 504, headers: { "content-type": "text/html" } })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(POST, "POST", "sales", { requestId: "7d0f2c0e-0000-4000-8000-000000000000", items: [] });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry validation or auth errors", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ success: false, error: { code: "VALIDATION_ERROR", message: "bad" } }, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(GET, "GET", "products");
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing BACKEND_URL on Render instead of calling localhost", async () => {
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("BACKEND_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(GET, "GET", "products");
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("CONFIG_ERROR");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
