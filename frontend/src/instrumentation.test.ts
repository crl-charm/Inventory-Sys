import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

beforeEach(() => {
  vi.stubEnv("LOG_LEVEL", "error");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("instrumentation register", () => {
  it("pings the API health endpoint when the web server starts", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("BACKEND_URL", "https://api.test/");
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await register();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test/health");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does nothing outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await register();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not crash startup when BACKEND_URL is missing on Render", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("BACKEND_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(register()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns before a sleeping API answers", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("BACKEND_URL", "https://api.test");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const blocked = new Promise((resolve) => {
      timer = setTimeout(() => resolve("blocked"), 100);
    });
    const result = await Promise.race([register().then(() => "returned"), blocked]);
    clearTimeout(timer);

    expect(result).toBe("returned");
  });
});
