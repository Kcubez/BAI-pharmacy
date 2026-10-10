import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Upstash layer (optional — everything degrades to direct execution when the
 * env keys are absent, so local dev works with zero setup).
 *
 * 1. `cached()` — API response cache with per-user versioned keys.
 *    Bump the version on import to invalidate instantly.
 * 2. Event bus — Redis pub/sub in production (serverless instances don't
 *    share memory), in-memory fallback for local dev.
 * 3. Rate limiters — login + import brute-force protection.
 */

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const upstashEnabled = Boolean(URL && TOKEN);

let client: Redis | null = null;
export function upstash(): Redis | null {
  if (!upstashEnabled) return null;
  if (!client) client = new Redis({ url: URL as string, token: TOKEN as string });
  return client;
}

// ─── Cached fetch ────────────────────────────────────────────────────────────

const VERSION_PREFIX = "bai:ver";
const CACHE_REQUEST_TIMEOUT_MS = 750;

type LocalCacheEntry = { expiresAt: number; data: unknown };
type LocalCacheStore = {
  entries: Map<string, LocalCacheEntry>;
  inFlight: Map<string, Promise<unknown>>;
};

// Development and single-instance deployments should not repeat expensive
// dashboard aggregates merely because Redis is intentionally unconfigured.
// This is deliberately process-local: it has no external service dependency,
// and production multi-instance deployments can still opt into Upstash.
const localCacheStore = globalThis as typeof globalThis & { __baiLocalCache?: LocalCacheStore };
const localCache = localCacheStore.__baiLocalCache ?? {
  entries: new Map<string, LocalCacheEntry>(),
  inFlight: new Map<string, Promise<unknown>>(),
};
if (!localCacheStore.__baiLocalCache) localCacheStore.__baiLocalCache = localCache;

function localCacheKey(scope: string, userId: string, key: string) {
  return `${scope}:${userId}:${key}`;
}

/** Never let an optional remote cache delay a dashboard response. */
function cacheRequest<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Cache request timed out")),
      CACHE_REQUEST_TIMEOUT_MS,
    );
    operation.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function versionOf(scope: string, userId: string): Promise<number | null> {
  const r = upstash();
  if (!r) return 0;
  try {
    const v = await cacheRequest(r.get<number>(`${VERSION_PREFIX}:${scope}:${userId}`));
    return typeof v === "number" ? v : 0;
  } catch {
    return null;
  }
}

async function cachedLocally<T>(
  scope: string,
  userId: string,
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; hit: boolean }> {
  const cacheKey = localCacheKey(scope, userId, key);
  const existing = localCache.entries.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) return { data: existing.data as T, hit: true };

  const pending = localCache.inFlight.get(cacheKey) as Promise<T> | undefined;
  if (pending) return { data: await pending, hit: true };

  const work = fetcher();
  localCache.inFlight.set(cacheKey, work);
  try {
    const data = await work;
    localCache.entries.set(cacheKey, { data, expiresAt: Date.now() + ttlSec * 1000 });
    return { data, hit: false };
  } finally {
    localCache.inFlight.delete(cacheKey);
  }
}

export async function bumpCacheVersion(scope: string, userId: string): Promise<void> {
  const prefix = `${scope}:${userId}:`;
  for (const key of localCache.entries.keys()) {
    if (key.startsWith(prefix)) localCache.entries.delete(key);
  }
  const r = upstash();
  if (!r) return;
  await r.incr(`${VERSION_PREFIX}:${scope}:${userId}`);
}

/** Run `fetcher`, caching the JSON-serialisable result for `ttlSec`.
 *  Falls back to a bounded-lifetime, process-local cache when Redis is absent.
 *  Concurrent matching requests share one in-flight database calculation. */
export async function cached<T>(
  scope: string,
  userId: string,
  key: string,
  ttlSec: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; hit: boolean }> {
  const r = upstash();
  if (!r) return cachedLocally(scope, userId, key, ttlSec, fetcher);

  const ver = await versionOf(scope, userId);
  if (ver === null) return cachedLocally(scope, userId, key, ttlSec, fetcher);
  const cacheKey = `bai:cache:${scope}:${userId}:v${ver}:${key}`;
  try {
    const hit = await cacheRequest(r.get<T>(cacheKey));
    if (hit !== null && hit !== undefined) return { data: hit, hit: true };
  } catch {
    // Cache read failure must never break the request.
  }
  const data = await fetcher();
  try {
    await cacheRequest(r.set(cacheKey, data, { ex: ttlSec }));
  } catch {
    // ignore write failures
  }
  return { data, hit: false };
}

// ─── Event bus (SSE fan-out) ─────────────────────────────────────────────────

export interface BusEvent {
  type: "data-changed";
  scope: string;
  at: number;
}

// Local-dev fallback: in-process subscribers (NOT shared across instances).
type Handler = (e: BusEvent) => void;
const localSubs = new Map<string, Set<Handler>>();

export async function publishEvent(userId: string, scope: string): Promise<void> {
  const event: BusEvent = { type: "data-changed", scope, at: Date.now() };
  const r = upstash();
  if (r) {
    // Cross-instance inbox (REST has no SUBSCRIBE): LPUSH + EXPIRE.
    // Consumers drain it from the SSE stream. Events are rare; cost ~2 cmds.
    try {
      await r.lpush(`bai:inbox:${userId}`, JSON.stringify(event));
      await r.expire(`bai:inbox:${userId}`, 600);
    } catch {
      // fall through to local delivery attempt
    }
  }
  const subs = localSubs.get(userId);
  if (subs) for (const h of subs) h(event);
}

export function subscribeLocal(userId: string, handler: Handler): () => void {
  let set = localSubs.get(userId);
  if (!set) {
    set = new Set();
    localSubs.set(userId, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
  };
}

// ─── Rate limiters ───────────────────────────────────────────────────────────

let loginLimiter: Ratelimit | null = null;
let importLimiter: Ratelimit | null = null;

function limiter(kind: "login" | "import"): Ratelimit | null {
  const r = upstash();
  if (!r) return null;
  if (kind === "login") {
    if (!loginLimiter) {
      loginLimiter = new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "bai:rl:login",
      });
    }
    return loginLimiter;
  }
  if (!importLimiter) {
    importLimiter = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(5, "1 m"),
      prefix: "bai:rl:import",
    });
  }
  return importLimiter;
}

export async function checkRateLimit(
  kind: "login" | "import",
  key: string,
): Promise<{ ok: boolean; resetMs?: number }> {
  const l = limiter(kind);
  if (!l) return { ok: true };
  try {
    const res = await l.limit(key);
    return { ok: res.success, resetMs: res.reset };
  } catch {
    return { ok: true };
  }
}
