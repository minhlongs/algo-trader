/**
 * Tests for RedisRateLimiter — sliding-window algorithm.
 *
 * Uses ioredis-mock (in-memory Redis, no external dependency).
 * Each test patches @redis/getRedisClient independently to avoid
 * shared-mutable-state issues in vitest threads mode.
 */

import { describe, it, expect, vi } from 'vitest';
import Redis from 'ioredis-mock';
import {
  RedisRateLimiter,
  TIER_RATE_LIMITS,
  DEFAULT_TIER_LIMITS,
} from '../redis-rate-limiter';
import { makeLimiter, withTierOverride, withRedis } from './redis-rate-limiter-helpers';

function stub(over: Partial<Redis>): Redis {
  return {
    zcard: async () => 0,
    pipeline: () => ({ exec: async () => [] }) as never,
    zremrangebyscore: () => {},
    zadd: () => {},
    expire: () => {},
    del: async () => 0,
    ...over,
  } as unknown as Redis;
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

  it('FREE/PRO/ENTERPRISE have positive requestsPerMin + burstPerSec', () => {
    expect(TIER_RATE_LIMITS.FREE.requestsPerMin).toBeGreaterThan(0);
    expect(TIER_RATE_LIMITS.PRO.requestsPerMin).toBeGreaterThan(0);
    expect(TIER_RATE_LIMITS.ENTERPRISE.requestsPerMin).toBeGreaterThan(0);
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

  it('allows up to FREE=10 then blocks the 11th', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      const key = 'ratelimit:u-fill:60s';
      const now = Date.now();
      const start = now - 55_000;
      for (let i = 0; i < 10; i++) {
        await mock.zadd(key, start + Math.floor(i * 500), `seeded-${i}`);
      }
      expect(await mock.zcard(key)).toBe(10);
      const blocked = await limiter.checkRateLimit('u-fill', 'FREE');
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  it('remaining count reflects in-flight requests (PRO cap=20, used=7)', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      withTierOverride('PRO', { requestsPerMin: 20, burstPerSec: 10 }, async () => {
        for (let i = 0; i < 7; i++) await limiter.checkRateLimit('u-partial', 'PRO');
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
    const s = stub({ pipeline: () => { throw new Error('ECONNREFUSED'); } });
    return withRedis(async () => {
      const limiter = makeLimiter();
      const mod = await import('@redis');
      // @ts-expect-error — overriding the already-patched client
      vi.spyOn(mod, 'getRedisClient').mockReturnValue(s);
      const r = await limiter.checkRateLimit('u-down', 'MASTER');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(TIER_RATE_LIMITS.MASTER.requestsPerMin);
    });
  });

  it('gracefully allows when Redis zcard() throws after pipeline exec', async () => {
    const s = stub({
      pipeline: () => ({ exec: async () => [[null, 0], [null, 1], [null, 0]] }),
      zcard: async () => { throw new Error('Connection lost'); },
    });
    return withRedis(async () => {
      const limiter = makeLimiter();
      const mod = await import('@redis');
      vi.spyOn(mod, 'getRedisClient').mockReturnValue(s);
      const r = await limiter.checkRateLimit('u-down2', 'MASTER');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(0);
    });
  });

  it('tier names are case-insensitive', async () => {
    return withRedis(async (mock) => {
      const limiter = makeLimiter();
      expect((await limiter.checkRateLimit('u-c1', 'basic')).allowed).toBe(true);
      expect((await limiter.checkRateLimit('u-c2', 'Premium')).allowed).toBe(true);
      expect((await limiter.checkRateLimit('u-c3', 'master')).allowed).toBe(true);
    });
  });
});
