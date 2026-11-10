import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCachedApi, getApiCacheSnapshot, invalidateApiCache, refreshApiCache, subscribeApiCache } from "./api-cache";
import { api } from "./api-client";

const key = "/api/products\njson";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => { invalidateApiCache(); vi.unstubAllGlobals(); });

describe("API cache", () => {
  it("shares a read and notifies mounted subscribers when invalidation requires a refetch", async () => {
    const read = deferred<number[]>();
    const load = vi.fn(() => read.promise);
    const first = fetchCachedApi(key, load);
    const second = fetchCachedApi(key, load);
    read.resolve([1]);
    await Promise.all([first, second]);
    expect(load).toHaveBeenCalledTimes(1);
    const before = getApiCacheSnapshot(key);
    const listener = vi.fn();
    const unsubscribe = subscribeApiCache(listener);
    invalidateApiCache("/api/products");
    unsubscribe();
    expect(listener).toHaveBeenCalledOnce();
    expect(getApiCacheSnapshot(key).revision).toBeGreaterThan(before.revision);
    expect(getApiCacheSnapshot(key).data).toBeUndefined();
    await fetchCachedApi(key, async () => [2]);
    expect(getApiCacheSnapshot(key).data).toEqual([2]);
  });

  it("discards a response started before a write or authentication change", async () => {
    const old = deferred<string>();
    const stale = fetchCachedApi(key, () => old.promise);
    invalidateApiCache();
    await fetchCachedApi(key, async () => "new session");
    old.resolve("old session");
    await stale;
    expect(getApiCacheSnapshot(key).data).toBe("new session");
  });

  it("an old failure cannot replace a newer request or its data", async () => {
    const old = deferred<string>();
    const stale = fetchCachedApi(key, () => old.promise).catch(() => undefined);
    invalidateApiCache();
    const fresh = deferred<string>();
    const current = fetchCachedApi(key, () => fresh.promise);
    old.reject(new Error("stale error"));
    await stale;
    const duplicate = vi.fn(async () => "wrong");
    const shared = fetchCachedApi(key, duplicate);
    fresh.resolve("fresh");
    await Promise.all([current, shared]);
    expect(duplicate).not.toHaveBeenCalled();
    expect(getApiCacheSnapshot(key).data).toBe("fresh");
    expect(getApiCacheSnapshot(key).error).toBeUndefined();
  });

  it("refresh keeps current data visible even if background revalidation fails", async () => {
    await fetchCachedApi(key, async () => [1]);
    refreshApiCache(key);
    await expect(fetchCachedApi(key, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(getApiCacheSnapshot(key).data).toEqual([1]);
  });

  it("successful writes invalidate both JSON and paginated views", async () => {
    const pagedKey = "/api/products\npaginated";
    await fetchCachedApi(key, async () => [1]);
    await fetchCachedApi(pagedKey, async () => ({ items: [1], total: 1 }));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true, data: null })));
    await api.post("/api/stock-movements/stock-in", { quantity: "1" });
    expect(getApiCacheSnapshot(key).data).toBeUndefined();
    expect(getApiCacheSnapshot(pagedKey).data).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
