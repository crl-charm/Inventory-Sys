import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./lib/db";
import { register, warmDatabase } from "./instrumentation";

beforeEach(() => {
  vi.stubEnv("LOG_LEVEL", "error");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("instrumentation register", () => {
  it("warms up the database pool when the Node.js server starts", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const spy = vi.spyOn(db, "pingDatabase").mockResolvedValue(true);

    await register();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(spy).toHaveBeenCalled();
  });

  it("does nothing outside the Node.js runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const spy = vi.spyOn(db, "pingDatabase").mockResolvedValue(true);

    await register();

    expect(spy).not.toHaveBeenCalled();
  });

  it("does not crash startup when required Render env vars are missing", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("DB_HOST", "");
    const spy = vi.spyOn(db, "pingDatabase").mockResolvedValue(true);

    await expect(register()).resolves.toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns before a slow database ping finishes", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.spyOn(db, "pingDatabase").mockImplementation(() => new Promise(() => {}));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const blocked = new Promise((resolve) => {
      timer = setTimeout(() => resolve("blocked"), 100);
    });
    const result = await Promise.race([
      register().then(() => "returned"),
      blocked,
    ]);
    clearTimeout(timer);

    expect(result).toBe("returned");
  });

  it("retries database warm-up and stops once reachable", async () => {
    vi.useFakeTimers();
    try {
      const probe = vi
        .fn<() => Promise<boolean>>()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const pending = warmDatabase(probe);
      await vi.advanceTimersByTimeAsync(2_000);
      await pending;

      expect(probe).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
