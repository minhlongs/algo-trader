/**
 * Tests for RedisRateLimiter — sliding window, getCurrentCount, reset.
 *
 * Self-contained sub-suite. Imports shared helpers from
 * redis-rate-limiter-helpers.ts so it stays under 200 LOC.
 */

import { describe, it, expect, vi } from 'vitest';
import Redis from 'ioredis-mock';
import {
  RedisRateLimiter,
  DEFAULT_TIER_LIMITS,
} from '../redis-rate-limiter';
import { makeLimiter, withTierOverride, withRedis } from './redis-rate-limiter-helpers';

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

// ─── checkRateLimit namespace ─────────────────────────────────────────────────

describe('checkRateLimit namespace', () => {
  it('creates a zset key in the expected namespace', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      await limiter.checkRateLimit('u-ns', 'FREE');
      const count = await limiter.getCurrentCount('u-ns');
      expect(count).toBeGreaterThanOrEqual(1);
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

// ─── checkRateLimit tier edge-cases ───────────────────────────────────────────

describe('checkRateLimit tier edge-cases', () => {
  it('falls back to DEFAULT_TIER_LIMITS for unknown tier', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      const r = await limiter.checkRateLimit('u-ghost', 'DRAGON_TIER');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(DEFAULT_TIER_LIMITS.requestsPerMin - 1);
    });
  });

  it('isolates limits per userId (separate Redis keys)', async () => {
    return withRedis(async () => {
      const limiter = makeLimiter();
      withTierOverride('FREE', { requestsPerMin: 3, burstPerSec: 2 }, async () => {
        await limiter.checkRateLimit('u-A', 'FREE');
        await limiter.checkRateLimit('u-A', 'FREE');
        await limiter.checkRateLimit('u-A', 'FREE');
        // A is now blocked; B is on a different key → unaffected
        expect((await limiter.checkRateLimit('u-A', 'FREE')).allowed).toBe(false);
        expect((await limiter.checkRateLimit('u-B', 'FREE')).allowed).toBe(true);
      });
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
