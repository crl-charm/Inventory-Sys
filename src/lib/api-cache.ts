export interface ApiCacheSnapshot {
  data?: unknown;
  error?: unknown;
  revision: number;
}

const emptySnapshot: ApiCacheSnapshot = { revision: 0 };
const cache = new Map<string, ApiCacheSnapshot>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeApiCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getApiCacheSnapshot(key: string | null): ApiCacheSnapshot {
  return (key ? cache.get(key) : undefined) ?? emptySnapshot;
}

/** Drop matching cached data and detach older reads so they cannot restore it. */
export function invalidateApiCache(prefix?: string): void {
  for (const [key, entry] of cache) {
    if (!prefix || key.startsWith(prefix)) {
      cache.set(key, { revision: entry.revision + 1 });
      inflight.delete(key);
    }
  }
  emit();
}

/** Refetch while leaving the current data visible. */
export function refreshApiCache(key: string): void {
  const entry = getApiCacheSnapshot(key);
  cache.set(key, { data: entry.data, revision: entry.revision + 1 });
  inflight.delete(key);
  emit();
}

export function fetchCachedApi<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const entry = getApiCacheSnapshot(key);
  cache.set(key, { ...entry, error: undefined });
  const promise = Promise.resolve().then(load).then((data) => {
    if (inflight.get(key) === promise) {
      cache.set(key, { data, revision: entry.revision });
      inflight.delete(key);
      emit();
    }
    return data;
  }).catch((error: unknown) => {
    if (inflight.get(key) === promise) {
      cache.set(key, { ...entry, error });
      inflight.delete(key);
      emit();
    }
    throw error;
  });
  inflight.set(key, promise);
  return promise;
}
