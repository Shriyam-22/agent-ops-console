import Redis from "ioredis";

/**
 * Minimal key-value interface used for metric caching and rate limiting.
 * Redis in production; an in-memory version for tests and for running without Redis.
 */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Increment a counter, setting its expiry when it is first created. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function redisCache(url: string): Cache {
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
  redis.on("error", (err) => console.warn(`[redis] ${err.message}`));

  return {
    get: (key) => redis.get(key),
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, "EX", ttlSeconds);
    },
    async incr(key, ttlSeconds) {
      const [[, count]] = (await redis.multi().incr(key).expire(key, ttlSeconds, "NX").exec()) as [
        [Error | null, number],
        [Error | null, number],
      ];
      return count;
    },
    async ping() {
      try {
        return (await redis.ping()) === "PONG";
      } catch {
        return false;
      }
    },
    async close() {
      await redis.quit();
    },
  };
}

export function memoryCache(now: () => number = Date.now): Cache {
  const store = new Map<string, { value: string; expiresAt: number }>();

  const read = (key: string) => {
    const hit = store.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= now()) {
      store.delete(key);
      return null;
    }
    return hit;
  };

  return {
    async get(key) {
      return read(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
    },
    async incr(key, ttlSeconds) {
      const hit = read(key);
      const count = (hit ? Number(hit.value) : 0) + 1;
      store.set(key, { value: String(count), expiresAt: hit?.expiresAt ?? now() + ttlSeconds * 1000 });
      return count;
    },
    async ping() {
      return true;
    },
    async close() {
      store.clear();
    },
  };
}

/**
 * Read-through cache with version-based invalidation: every write bumps a version
 * number, and cache keys include it, so stale entries are never read again.
 */
export async function cached<T>(
  cache: Cache,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  try {
    const version = (await cache.get("metrics:version")) ?? "0";
    const fullKey = `${key}:v${version}`;
    const raw = await cache.get(fullKey);
    if (raw !== null) return { value: JSON.parse(raw) as T, hit: true };
    const value = await load();
    await cache.set(fullKey, JSON.stringify(value), ttlSeconds);
    return { value, hit: false };
  } catch (err) {
    // The cache is an optimisation: if it is down, serve from the database.
    console.warn(`[cache] bypassed: ${(err as Error).message}`);
    return { value: await load(), hit: false };
  }
}

export async function invalidateMetrics(cache: Cache): Promise<void> {
  try {
    await cache.incr("metrics:version", 7 * 24 * 3600);
  } catch (err) {
    console.warn(`[cache] invalidation skipped: ${(err as Error).message}`);
  }
}
