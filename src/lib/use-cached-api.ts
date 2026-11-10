"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, ApiClientError, type Paginated } from "./api-client";
import {
  fetchCachedApi,
  getApiCacheSnapshot,
  refreshApiCache,
  subscribeApiCache,
} from "./api-cache";
export { invalidateApiCache } from "./api-cache";

/**
 * Tiny stale-while-revalidate cache for GET endpoints (one browser tab, one
 * owner, LAN speeds — no query library needed).
 *
 * - First visit: shows a loading state, then caches the response in memory.
 * - Re-visits / tab switches: paints instantly from cache and refreshes
 *   quietly in the background, so screens stop flashing skeletons.
 * - Successful API writes invalidate cached reads automatically. Mounted
 *   screens refetch, and older in-flight reads cannot restore stale data.
 */

export interface CachedResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Silent background refetch — keeps current data visible until fresh data lands. */
  refresh: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : "Something went wrong. Please try again.";
}

function useCacheCore<T>(
  path: string | null,
  mode: "json" | "paginated"
): CachedResource<T> {
  // The same URL can be read as plain JSON or with pagination metadata.
  const key = path === null ? null : `${path}\n${mode}`;
  const entry = useSyncExternalStore(
    subscribeApiCache,
    () => getApiCacheSnapshot(key),
    () => getApiCacheSnapshot(null)
  );

  useEffect(() => {
    if (!path || !key) return;
    void fetchCachedApi(key, () =>
      mode === "paginated" ? api.getPaginated(path) : api.get(path)
    ).catch(() => undefined);
  }, [path, key, mode, entry.revision]);

  const refresh = useCallback(() => { if (key) refreshApiCache(key); }, [key]);
  const data = (entry?.data as T | undefined) ?? null;
  const hasData = entry.data !== undefined;
  const visibleError = hasData || !entry.error ? null : messageOf(entry.error);
  return {
    data,
    loading: path !== null && !hasData && visibleError === null,
    error: visibleError,
    refresh,
  };
}

/** GET a JSON endpoint with caching. Pass `null` while the key is unknown. */
export function useCachedApi<T>(path: string | null): CachedResource<T> {
  return useCacheCore<T>(path, "json");
}

/** Same, for list endpoints that return `{ items, page, total, ... }`. */
export function useCachedPagedApi<T>(
  path: string | null
): CachedResource<Paginated<T>> {
  return useCacheCore<Paginated<T>>(path, "paginated");
}
