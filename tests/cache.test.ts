// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const redis = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), incr: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class { get=redis.get; set=redis.set; incr=redis.incr; } }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://cache.test");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
it("uses local hits without contacting slow Redis in development and invalidates after import", async () => {
  const { cached, bumpCacheVersion } = await import("@/lib/upstash");
  const fetcher = vi.fn().mockResolvedValue("data");
  await cached("test", "dev", "key", 60, fetcher);
  expect((await cached("test", "dev", "key", 60, fetcher)).hit).toBe(true);
  expect(redis.get).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  await bumpCacheVersion("test", "dev");
  await cached("test", "dev", "key", 60, fetcher);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("bounds a stalled Redis lookup and bypasses it during the outage cooldown", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.useFakeTimers();
  redis.get.mockImplementation(() => new Promise(() => {}));
  const { cached } = await import("@/lib/upstash");
  const fetcher = vi.fn().mockResolvedValue("data");
  const pending = cached("test", "prod", "key", 60, fetcher);
  await vi.advanceTimersByTimeAsync(150);
  expect((await pending).data).toBe("data");
  expect((await cached("test", "prod", "key", 60, fetcher)).hit).toBe(true);
  expect(redis.get).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("checks the shared version in production so another instance can invalidate data", async () => {
  vi.stubEnv("NODE_ENV", "production");
  redis.get.mockResolvedValueOnce(1).mockResolvedValueOnce("first")
    .mockResolvedValueOnce(2).mockResolvedValueOnce("updated");
  const { cached } = await import("@/lib/upstash");
  const fetcher = vi.fn();
  expect((await cached("test", "shared", "key", 60, fetcher)).data).toBe("first");
  expect((await cached("test", "shared", "key", 60, fetcher)).data).toBe("updated");
  expect(redis.get.mock.calls[1][0]).toContain(":v1:");
  expect(redis.get.mock.calls[3][0]).toContain(":v2:");
  expect(fetcher).not.toHaveBeenCalled();
});
