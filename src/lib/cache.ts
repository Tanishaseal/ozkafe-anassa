// In-memory caching with single-flight request coalescing and tag invalidation
// Prevents database query spamming and eliminates redundant Supabase hits

interface CacheRecord<T> {
  data: T;
  expiresAt: number;
  tags: string[];
}

interface GlobalCacheStore {
  __oz_memory_cache?: Map<string, CacheRecord<unknown>>;
  __oz_inflight_promises?: Map<string, Promise<unknown>>;
  __oz_cache_cleaner_started?: boolean;
}

const g = globalThis as unknown as GlobalCacheStore;

if (!g.__oz_memory_cache) {
  g.__oz_memory_cache = new Map();
}

if (!g.__oz_inflight_promises) {
  g.__oz_inflight_promises = new Map();
}

// Periodic cleanup of expired cache records every 30 seconds
if (!g.__oz_cache_cleaner_started) {
  g.__oz_cache_cleaner_started = true;
  setInterval(() => {
    const now = Date.now();
    const cache = g.__oz_memory_cache;
    if (cache) {
      for (const [key, record] of cache.entries()) {
        if (record.expiresAt <= now) {
          cache.delete(key);
        }
      }
    }
  }, 30000);
}

/**
 * Fetch data using in-memory cache with TTL and promise coalescing.
 * If 5 concurrent requests arrive for the same key, only ONE query runs
 * and all 5 callers receive the result of that single database call.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
  tags: string[] = []
): Promise<T> {
  const now = Date.now();
  const cache = g.__oz_memory_cache!;
  const inFlight = g.__oz_inflight_promises!;

  // 1. Check valid cached record
  const cached = cache.get(key) as CacheRecord<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  // 2. Check in-flight promise (Request Coalescing / Single-Flight)
  const existingPromise = inFlight.get(key) as Promise<T> | undefined;
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Execute fetcher with in-flight lock
  const fetchPromise = (async () => {
    try {
      const data = await fetcher();
      // Store in cache
      cache.set(key, {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000,
        tags,
      });
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Immediately invalidates cached entries by key prefix or tag.
 * Called on any mutation (order status change, stock adjustment, menu edit, bill settlement).
 */
export function invalidateCache(tagOrKey?: string): void {
  const cache = g.__oz_memory_cache;
  if (!cache) return;

  if (!tagOrKey) {
    cache.clear();
    return;
  }

  const target = tagOrKey.toLowerCase();
  for (const [key, record] of Array.from(cache.entries())) {
    const keyMatch = key.toLowerCase().includes(target);
    const tagMatch = record.tags.some((t) => t.toLowerCase() === target);
    if (keyMatch || tagMatch) {
      cache.delete(key);
    }
  }
}
