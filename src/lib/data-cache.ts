// Lightweight in-memory, stale-while-revalidate cache for client-side Firestore reads.
// Lives in module scope, so as long as Astro's ClientRouter does a soft (no full reload)
// navigation between pages, this module instance — and its cached data — survives.
// This lets Dashboard/Collection show data instantly on repeat visits instead of
// re-fetching from Firestore (and blocking on a spinner) every single time.

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const store = new Map<string, CacheEntry<unknown>>();

// How long cached data is considered "fresh enough" to skip a background refetch.
// Anything older is still shown instantly (stale) while a refresh happens behind it.
const DEFAULT_TTL = 15_000;

export function getCached<T>(key: string): { data: T; isFresh: boolean } | null {
  const entry = store.get(key);
  if (!entry) return null;
  const isFresh = Date.now() - entry.timestamp < DEFAULT_TTL;
  return { data: entry.data as T, isFresh };
}

export function setCached<T>(key: string, data: T) {
  store.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
