"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiClientError, type Paginated } from "./api-client";

/**
 * Tiny stale-while-revalidate cache for GET endpoints (one browser tab, one
 * owner, LAN speeds — no query library needed).
 *
 * - First visit: shows a loading state, then caches the response in memory.
 * - Re-visits / tab switches: paints instantly from cache and refreshes
 *   quietly in the background, so screens stop flashing skeletons.
 * - Successful writes call `invalidateApiCache()` so the next read of any
 *   screen refetches fresh data; a screen that must update itself right away
 *   calls the `refresh()` returned by the hook.
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop cached GET responses. Call after any successful write. */
export function invalidateApiCache(prefix?: string): void {
  if (prefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
  emit();
}

function fetchOnce<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = load()
    .then((data) => {
      cache.set(key, { data, fetchedAt: Date.now() });
      inflight.delete(key);
      emit();
      return data;
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, promise);
  return promise;
}

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
  const entry = useSyncExternalStore(
    subscribe,
    () => (path ? cache.get(path) : undefined),
    () => undefined
  );
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    if (!cache.has(path)) setError(null);
    const key = path;
    void fetchOnce(key, () =>
      mode === "paginated" ? api.getPaginated(key) : api.get(key)
    ).catch((err: unknown) => {
      // Keep showing cached data when a background refresh fails.
      if (active && !cache.has(key)) setError(messageOf(err));
    });
    return () => {
      active = false;
    };
  }, [path, mode, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const data = (entry?.data as T | undefined) ?? null;
  const visibleError = entry ? null : error;
  return {
    data,
    loading: path !== null && !entry && visibleError === null,
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
