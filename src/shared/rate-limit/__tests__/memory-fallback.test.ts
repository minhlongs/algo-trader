/**
 * Tests for in-memory LRU fallback rate limiter.
 * @module shared/rate-limit/memory-fallback.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRateLimiter, MEMORY_FALLBACK_CONFIG } from '../memory-fallback';

const FALLBACK_INSTANCE = new MemoryRateLimiter(1_000);

describe('MemoryRateLimiter', () => {
  beforeEach(async () => { await FALLBACK_INSTANCE.clearAll(); });
  afterAll(async () => { FALLBACK_INSTANCE.destroy(); });

  describe('checkLimit', () => {
    it('allows the first request and reports remaining', async () => {
      const r = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-1', limit: 3, windowMs: 60_000 });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(2);
      expect(r.isFallback).toBe(true);
      expect(r.retryAfterMs).toBe(0);
    });

    it('rejects once the limit is exceeded', async () => {
      const limit = 2;
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-2', limit, windowMs: 60_000 });
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-2', limit, windowMs: 60_000 });

      const r = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-2', limit, windowMs: 60_000 });
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
      expect(r.retryAfterMs).toBeGreaterThan(0);
    });

    it('defaults to configured DEFAULT_LIMIT when limit omitted', async () => {
      const r = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-default' });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(MEMORY_FALLBACK_CONFIG.DEFAULT_LIMIT - 1);
    });

    it('respects windowMs sliding window', async () => {
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });

      const r1 = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });
      expect(r1.allowed).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 250));
      const r2 = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });
      expect(r2.allowed).toBe(true);
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least recently used entry when cache is full', async () => {
      const limiter = new MemoryRateLimiter(3);
      await limiter.checkLimit({ userId: 'u-a', limit: 10, windowMs: 60_000 });
      await limiter.checkLimit({ userId: 'u-b', limit: 10, windowMs: 60_000 });
      await limiter.checkLimit({ userId: 'u-c', limit: 10, windowMs: 60_000 });
      expect(limiter.getStats().entries).toBe(3);

      await limiter.checkLimit({ userId: 'u-a', limit: 10, windowMs: 60_000 });
      await limiter.checkLimit({ userId: 'u-d', limit: 10, windowMs: 60_000 });

      const stats = limiter.getStats();
      expect(stats.entries).toBe(3);
      expect(stats.utilizationPercent).toBe(100);
      limiter.destroy();
    });

    it('respects maxEntries bound strictly', async () => {
      const limiter = new MemoryRateLimiter(5);
      for (let i = 0; i < 10; i++) {
        await limiter.checkLimit({ userId: `u-${i}`, limit: 10, windowMs: 60_000 });
      }
      expect(limiter.getStats().entries).toBeLessThanOrEqual(5);
      limiter.destroy();
    });
  });

  describe('TTL and cleanup', () => {
    it('evicts expired entries on getCount', async () => {
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-ttl', limit: 5, windowMs: 150 });
      expect(await FALLBACK_INSTANCE.getCount('u-ttl', 150)).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await FALLBACK_INSTANCE.getCount('u-ttl', 150)).toBe(0);
    });

    it('reset clears a specific user immediately', async () => {
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-reset', limit: 5, windowMs: 60_000 });
      expect(await FALLBACK_INSTANCE.getCount('u-reset', 60_000)).toBe(1);

      await FALLBACK_INSTANCE.reset('u-reset');
      expect(await FALLBACK_INSTANCE.getCount('u-reset', 60_000)).toBe(0);
    });
  });

  describe('thread safety', () => {
    it('handles concurrent checkLimit calls without corruption', async () => {
      const concurrency = 50;
      const results = await Promise.all(
        Array.from({ length: concurrency }, () =>
          FALLBACK_INSTANCE.checkLimit({ userId: 'u-concurrent', limit: 100, windowMs: 60_000 }),
        ),
      );
      expect(results.filter((r) => r.allowed).length).toBe(concurrency);
      expect(await FALLBACK_INSTANCE.getCount('u-concurrent', 60_000)).toBe(concurrency);
    });
  });

  describe('getStats', () => {
    it('reports correct entry count and utilization', async () => {
      await FALLBACK_INSTANCE.checkLimit({ userId: 's1', limit: 10, windowMs: 60_000 });
      await FALLBACK_INSTANCE.checkLimit({ userId: 's2', limit: 10, windowMs: 60_000 });
      const stats = FALLBACK_INSTANCE.getStats();
      expect(stats.entries).toBe(2);
      expect(stats.utilizationPercent).toBeGreaterThanOrEqual(0);
    });
  });
});
