/**
 * Chaos: Redis Outage
 * Simulates Redis connection failure; verifies graceful degradation.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { RedisRateLimiter } from '../../src/forest/rate-limit/redis-rate-limiter';

async function withFailingRedis<T>(fn: (limiter: RedisRateLimiter) => Promise<T>): Promise<T> {
  const limiter = new RedisRateLimiter({ windowSeconds: 60, maxRequests: 100 });

  const stub: Partial<Redis> = {
    pipeline: () => ({ exec: async () => { throw new Error('ECONNREFUSED 127.0.0.1:6379'); } }) as never,
    zcard: async () => { throw new Error('Redis down'); },
    zremrangebyscore: () => {},
    zadd: () => {},
    expire: () => {},
    del: async () => { throw new Error('Redis down'); },
    set: async () => {},
    get: async () => null,
  } as unknown as Redis;

  const mod = await import('@redis');
  const spy = vi.spyOn(mod, 'getRedisClient').mockReturnValue(stub as never);

  try {
    return await fn(limiter);
  } finally {
    spy.mockRestore();
  }
}

describe('Chaos: Redis Outage', () => {
  it('allows request when Redis throws ECONNREFUSED', async () => {
    await withFailingRedis(async (limiter) => {
      const result = await limiter.checkRateLimit('user-ok', 'free');
      expect(result.allowed).toBe(true);
    });
  });

  it('returns 0 from getCurrentCount on Redis failure', async () => {
    await withFailingRedis(async (limiter) => {
      const count = await limiter.getCurrentCount('user-ok');
      expect(count).toBe(0);
    });
  });

  it('reset does not throw when Redis del fails', async () => {
    await withFailingRedis(async (limiter) => {
      await expect(limiter.reset('user-ok')).resolves.toBeUndefined();
    });
  });

  it('no unhandled exception across concurrent outage checks', async () => {
    await withFailingRedis(async (limiter) => {
      const results = await Promise.all([
        limiter.checkRateLimit('u1', 'free'),
        limiter.checkRateLimit('u2', 'free'),
        limiter.checkRateLimit('u3', 'free'),
      ]);
      for (const r of results) {
        expect(r.allowed).toBe(true);
      }
    });
  });

  it('remains stable under high-concurrency outage pattern', async () => {
    await withFailingRedis(async (limiter) => {
      const batch1 = await Promise.all(
        Array.from({ length: 20 }, (_, i) => limiter.checkRateLimit(`u-concurrent-${i}`, 'free'))
      );
      const batch2 = await Promise.all(
        Array.from({ length: 20 }, (_, i) => limiter.checkRateLimit(`u-concurrent-${i}`, 'free'))
      );
      for (const r of [...batch1, ...batch2]) {
        expect(r.allowed).toBe(true);
      }
    });
  });
});