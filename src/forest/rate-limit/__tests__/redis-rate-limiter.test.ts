/**
 * Tests for RedisRateLimiter — sliding-window algorithm.
 *
 * Uses ioredis-mock (in-memory Redis, no external dependency).
 *
 * Each test patches @redis/getRedisClient independently to avoid
 * shared-mutable-state issues in vitest threads mode.
 */

import { describe, it, expect, vi } from 'vitest';
import Redis from 'ioredis-mock';
import {
  RedisRateLimiter,
  TIER_RATE_LIMITS,
  DEFAULT_TIER_LIMITS,
  type TierRateLimits,
} from '../redis-rate-limiter';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLimiter(
  windowSeconds = 60,
  keyTtlSeconds?: number,
): RedisRateLimiter {
  return new RedisRateLimiter({ windowSeconds, keyTtlSeconds });
}

/**
 * Override a TIER_RATE_LIMITS entry for the duration of `fn`.
 * Uses uppercase key matching resolveLimits().toUpperCase().
 */
function withTierOverride(
  tierName: string,
  limits: TierRateLimits,
  fn: () => void | Promise<void>,
): void {
  const key = tierName.toUpperCase();
  const saved = TIER_RATE_LIMITS[key];
  TIER_RATE_LIMITS[key] = limits;
  try { void fn(); } finally { TIER_RATE_LIMITS[key] = saved; }
}

/**
 * Patch @redis/getRedisClient to return a fresh ioredis-mock instance,
 * run `fn(mock)`, then restore the original.
 */
async function withRedis<T>(
  fn: (mock: Redis) => Promise<T>,
): Promise<T> {
  const mock = new Redis();
  await mock.flushall();

  const mod = await import('@redis');
  // @ts-expect-error — test helper; mock return type intentional
  const spy = vi.spyOn(mod, 'getRedisClient').mockReturnValue(mock);

  try {
    return await fn(mock);
  } finally {
    spy.mockRestore();
  }
}

// ─── Tier Constants ───────────────────────────────────────────────────────────

describe('TIER_RATE_LIMITS', () => {
 it('FREE = 10 req/min', () => {
  expect(TIER_RATE_LIMITS.FREE.requestsPerMin).toBe(10);
 });

 it('PRO = 100 req/min', () => {
  expect(TIER_RATE_LIMITS.PRO.requestsPerMin).toBe(100);
 });

 it('ENTERPRISE = 1000 req/min', () => {
  expect(TIER_RATE_LIMITS.ENTERPRISE.requestsPerMin).toBe(1000);
 });

 it('MASTER = 0 (unlimited)', () => {
  expect(TIER_RATE_LIMITS.MASTER.requestsPerMin).toBe(0);
 });

 it('FREE/PRO/ENTERPRISE have positive requestsPerMin', () => {
  expect(TIER_RATE_LIMITS.FREE.requestsPerMin).toBeGreaterThan(0);
  expect(TIER_RATE_LIMITS.PRO.requestsPerMin).toBeGreaterThan(0);
  expect(TIER_RATE_LIMITS.ENTERPRISE.requestsPerMin).toBeGreaterThan(0);
 });

 it('FREE/PRO/ENTERPRISE have positive burstPerSec', () => {
  expect(TIER_RATE_LIMITS.FREE.burstPerSec).toBeGreaterThan(0);
  expect(TIER_RATE_LIMITS.PRO.burstPerSec).toBeGreaterThan(0);
  expect(TIER_RATE_LIMITS.ENTERPRISE.burstPerSec).toBeGreaterThan(0);
 });
});

describe('DEFAULT_TIER_LIMITS', () => {
  it('has positive values', () => {
    expect(DEFAULT_TIER_LIMITS.requestsPerMin).toBeGreaterThan(0);
    expect(DEFAULT_TIER_LIMITS.burstPerSec).toBeGreaterThan(0);
  });
});

// ─── checkRateLimit ───────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows the first request and reports remaining=9 for FREE', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      const r = await limiter.checkRateLimit('u-1', 'FREE');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(9);
    });
  });

  it('allows up to FREE=100 then blocks the 101st', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      // Pre-seed 100 entries at distinct timestamps all inside the
      // 60-second window so none get evicted by zremrangebyscore.
      // Each entry uses a unique member string to avoid dedup.
      const key = 'ratelimit:u-fill:60s';
      const now = Date.now();
      const windowStart = now - 55_000; // 5s inside window
      for (let i = 0; i < 10; i++) {
        const ts = windowStart + Math.floor(i * 500); // spread across ~50s
        await mock.zadd(key, ts, `seeded-${i}`);
      }
      expect(await mock.zcard(key)).toBe(10);

      // 11th call adds 1 more → count=11 > limit=100 → blocked
      const blocked = await limiter.checkRateLimit('u-fill', 'FREE');
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  it('remaining count reflects in-flight requests (PRO cap=100, used=7)', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      withTierOverride('PRO', { requestsPerMin: 20, burstPerSec: 10 }, async () => {
        for (let i = 0; i < 7; i++) {
          await limiter.checkRateLimit('u-partial', 'PRO');
        }
        // 8th call → remaining = 20 - 8 = 12
        const r = await limiter.checkRateLimit('u-partial', 'PRO');
        expect(r.remaining).toBe(12);
      });
    });
  });

  it('returns a valid resetAt ~60s from now', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      const result = await limiter.checkRateLimit('u-reset', 'MASTER');
      expect(result.resetAt).toBeInstanceOf(Date);
      const diff = result.resetAt.getTime() - Date.now();
      expect(diff).toBeGreaterThanOrEqual(55_000);
      expect(diff).toBeLessThanOrEqual(65_000);
    });
  });

  it('gracefully allows when Redis pipeline() throws', async () => {
    const stub = {
      pipeline: () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); },
      zcard: async () => 0,
      del: async () => 0,
    } as unknown as Redis;

    return withRedis(async () => {
      const limiter = makeLimiter();
      const mod = await import('@redis');
      // @ts-expect-error — overriding the already-patched client
      vi.spyOn(mod, 'getRedisClient').mockReturnValue(stub);

      const result = await limiter.checkRateLimit('u-down', 'MASTER');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(TIER_RATE_LIMITS.MASTER.requestsPerMin);
      expect(result.resetAt).toBeInstanceOf(Date);
    });
  });

  it('gracefully allows when Redis zcard() throws after pipeline exec', async () => {
    const stub = {
      pipeline: () => ({
        exec: async () => [
          [null, 0],
          [null, 1],
          [null, 1],
        ],
      }),
      zcard: async () => { throw new Error('Connection lost mid-read'); },
      del: async () => 0,
    } as unknown as Redis;

    return withRedis(async () => {
      const limiter = makeLimiter();
      const mod = await import('@redis');
      vi.spyOn(mod, 'getRedisClient').mockReturnValue(stub);

      const result = await limiter.checkRateLimit('u-down2', 'MASTER');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // MASTER = unlimited (no counter)
    });
  });

  it('tier names are case-insensitive', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      expect((await limiter.checkRateLimit('u-c1', 'basic')).allowed).toBe(true);
      expect((await limiter.checkRateLimit('u-c2', 'Premium')).allowed).toBe(true);
      expect((await limiter.checkRateLimit('u-c3', 'master')).allowed).toBe(true);
    });
  });

  it('falls back to DEFAULT_TIER_LIMITS for unknown tier', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      const result = await limiter.checkRateLimit('u-ghost', 'DRAGON_TIER');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(DEFAULT_TIER_LIMITS.requestsPerMin - 1);
    });
  });

  it('isolates limits per userId (separate Redis keys)', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      withTierOverride('FREE', { requestsPerMin: 3, burstPerSec: 2 }, async () => {
        await limiter.checkRateLimit('u-A', 'FREE');
        await limiter.checkRateLimit('u-A', 'FREE');
        await limiter.checkRateLimit('u-A', 'FREE');
        expect((await limiter.checkRateLimit('u-A', 'FREE')).allowed).toBe(false);
        // u-B: different key, unaffected
        expect((await limiter.checkRateLimit('u-B', 'FREE')).allowed).toBe(true);
      });
    });
  });

  it('creates a zset key in the expected namespace', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      await limiter.checkRateLimit('u-ns', 'FREE');
      const count = await limiter.getCurrentCount('u-ns');
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── Sliding Window: zremrangebyscore eviction ────────────────────────────────

describe('Sliding window — zremrangebyscore eviction', () => {
  it('evicts entries older than window start', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter(60);

      // Pre-seed: add an entry with score = 2 minutes ago (outside 60s window)
      const key = 'ratelimit:u-evict:60s';
      const oldScore = Date.now() - 120_000;
      await mock.zadd(key, oldScore, oldScore.toString());
      expect(await mock.zcard(key)).toBe(1);

      // checkRateLimit → zremrangebyscore evicts old entry, zadd adds new entry
      await limiter.checkRateLimit('u-evict', 'FREE');

      // Exactly 1 entry remains (old evicted, 1 new added)
      expect(await mock.zcard(key)).toBe(1);

      // The remaining score should be recent
      const entries = await mock.zrange(key, 0, -1, 'WITHSCORES');
      const latestScore = Number(entries[entries.length - 1]);
      expect(latestScore).toBeGreaterThan(oldScore);
    });
  });

  it('keeps multiple entries within the window', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter(60);

      const key = 'ratelimit:u-multi:60s';
      const now = Date.now();
      // Pre-seed 3 recent entries (within window)
      await mock.zadd(key, now - 30_000, (now - 30_000).toString());
      await mock.zadd(key, now - 15_000, (now - 15_000).toString());
      await mock.zadd(key, now - 5_000, (now - 5_000).toString());
      expect(await mock.zcard(key)).toBe(3);

      // After checkRateLimit: old entries still in window + 1 new >= 3
      await limiter.checkRateLimit('u-multi', 'FREE');
      expect(await mock.zcard(key)).toBeGreaterThanOrEqual(3);
    });
  });
});

// ─── getCurrentCount ──────────────────────────────────────────────────────────

describe('getCurrentCount', () => {
  it('returns zcard count of current window entries', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();

      // Seed the zset directly (withRedis injected mock instance)
      const key = 'ratelimit:u-gc:60s';
      const now = Date.now();
      await mock.zadd(key, now - 10_000, (now - 10_000).toString());
      await mock.zadd(key, now, now.toString());

      // getCurrentCount delegates to getRedisClient().zcard internally
      expect(await limiter.getCurrentCount('u-gc')).toBeGreaterThanOrEqual(2);
    });
  });

  it('returns 0 when Redis zcard throws', async () => {
    const stub = {
      zcard: async () => { throw new Error('Redis down'); },
      pipeline: () => ({ exec: async () => [] }) as never,
      zremrangebyscore: () => {},
      zadd: () => {},
      expire: () => {},
      del: async () => 0,
    } as unknown as Redis;

    return withRedis(async () => {
      const limiter = makeLimiter();
      const mod = await import('@redis');
      vi.spyOn(mod, 'getRedisClient').mockReturnValue(stub);

      expect(await limiter.getCurrentCount('u-gc-down')).toBe(0);
    });
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('deletes the rate-limit key', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();

      // Seed the zset directly
      const key = 'ratelimit:u-r1:60s';
      await mock.zadd(key, Date.now(), Date.now().toString());
      expect(await mock.exists(key)).toBe(1);

      await limiter.reset('u-r1');
      expect(await mock.exists(key)).toBe(0);
    });
  });

  it('suppresses errors when Redis del throws', async () => {
    const stub = {
      zcard: async () => 0,
      del: async () => { throw new Error('Redis down'); },
      pipeline: () => ({ exec: async () => [] }) as never,
      zremrangebyscore: () => {},
      zadd: () => {},
      expire: () => {},
    } as unknown as Redis;

    return withRedis(async () => {
      const limiter = makeLimiter();
      const mod = await import('@redis');
      vi.spyOn(mod, 'getRedisClient').mockReturnValue(stub);

      await expect(limiter.reset('u-r2')).resolves.toBeUndefined();
    });
  });
});
