// Stale-while-revalidate cache for client Firestore reads.
// Persists in sessionStorage so full page navigations still get instant paints.

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const memory = new Map<string, CacheEntry<unknown>>();
const STORAGE_KEY = "seentube:data-cache-v1";
const DEFAULT_TTL = 15_000;
const MAX_AGE_MS = 5 * 60_000;

function readStorage(): Record<string, CacheEntry<unknown>> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(entries: Record<string, CacheEntry<unknown>>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota / private mode
  }
}

function persistMemory() {
  const disk = readStorage();
  const now = Date.now();
  for (const [key, entry] of memory.entries()) {
    if (now - entry.timestamp <= MAX_AGE_MS) disk[key] = entry;
  }
  for (const key of Object.keys(disk)) {
    if (now - disk[key].timestamp > MAX_AGE_MS) delete disk[key];
  }
  writeStorage(disk);
}

export function getCached<T>(key: string): { data: T; isFresh: boolean } | null {
  let entry = memory.get(key);
  if (!entry) {
    const disk = readStorage()[key];
    if (disk && Date.now() - disk.timestamp <= MAX_AGE_MS) {
      entry = disk;
      memory.set(key, disk);
    }
  }
  if (!entry) return null;
  const isFresh = Date.now() - entry.timestamp < DEFAULT_TTL;
  return { data: entry.data as T, isFresh };
}

export function setCached<T>(key: string, data: T) {
  memory.set(key, { data, timestamp: Date.now() });
  persistMemory();
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return;
  }
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  const disk = readStorage();
  for (const key of Object.keys(disk)) {
    if (key.startsWith(prefix)) delete disk[key];
  }
  writeStorage(disk);
}
