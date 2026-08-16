/**
 * Tests for in-memory LRU fallback rate limiter.
 *
 * @module shared/rate-limit/memory-fallback.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRateLimiter, MEMORY_FALLBACK_CONFIG, type MemoryRateLimitResult } from '../memory-fallback';

// Small limit and window for fast tests
const FALLBACK_INSTANCE = new MemoryRateLimiter(1_000);

describe('MemoryRateLimiter', () => {
  beforeEach(async () => {
    await FALLBACK_INSTANCE.clearAll();
  });

  afterAll(async () => {
    FALLBACK_INSTANCE.destroy();
  });

  // ─── Basic Behaviour ────────────────────────────────────────────────────────

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
      // Use very short 100ms window
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });

      // Immediately blocked
      const r1 = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });
      expect(r1.allowed).toBe(false);

      // After window passes, should be allowed again
      await new Promise((resolve) => setTimeout(resolve, 250));
      const r2 = await FALLBACK_INSTANCE.checkLimit({ userId: 'u-win', limit: 2, windowMs: 200 });
      expect(r2.allowed).toBe(true);
    });
  });

  // ─── LRU Eviction ───────────────────────────────────────────────────────────

  describe('LRU eviction', () => {
    it('evicts the least recently used entry when cache is full', async () => {
      const limiter = new MemoryRateLimiter(3);

      // Fill cache with 3 distinct users
      await limiter.checkLimit({ userId: 'u-a', limit: 10, windowMs: 60_000 });
      await limiter.checkLimit({ userId: 'u-b', limit: 10, windowMs: 60_000 });
      await limiter.checkLimit({ userId: 'u-c', limit: 10, windowMs: 60_000 });

      expect(limiter.getStats().entries).toBe(3);

      // Touch u-a (now MRU) — linked list becomes: u-c → u-b → u-a (MRU=head)
      await limiter.checkLimit({ userId: 'u-a', limit: 10, windowMs: 60_000 });

      // Add u-d — cache hits maxEntries(3) again after evict, evicts u-c (tail, oldest LRU)
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

      const stats = limiter.getStats();
      expect(stats.entries).toBeLessThanOrEqual(5);

      limiter.destroy();
    });
  });

  // ─── TTL / Cleanup ──────────────────────────────────────────────────────────

  describe('TTL and cleanup', () => {
    it('evicts expired entries on getCount', async () => {
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-ttl', limit: 5, windowMs: 150 });
      const initial = await FALLBACK_INSTANCE.getCount('u-ttl', 150);
      expect(initial).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 200));

      // After window passes, count should return 0 (expired)
      const after = await FALLBACK_INSTANCE.getCount('u-ttl', 150);
      expect(after).toBe(0);
    });

    it('reset clears a specific user immediately', async () => {
      await FALLBACK_INSTANCE.checkLimit({ userId: 'u-reset', limit: 5, windowMs: 60_000 });
      const before = await FALLBACK_INSTANCE.getCount('u-reset', 60_000);
      expect(before).toBe(1);

      await FALLBACK_INSTANCE.reset('u-reset');
      const after = await FALLBACK_INSTANCE.getCount('u-reset', 60_000);
      expect(after).toBe(0);
    });
  });

  // ─── Concurrency ────────────────────────────────────────────────────────────

  describe('thread safety', () => {
    it('handles concurrent checkLimit calls without corruption', async () => {
      const concurrency = 50;
      const results = await Promise.all(
        Array.from({ length: concurrency }, (_, i) =>
          FALLBACK_INSTANCE.checkLimit({ userId: 'u-concurrent', limit: 100, windowMs: 60_000 }),
        ),
      );

      // All should be allowed (limit 100, concurrency 50)
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(concurrency);

      const count = await FALLBACK_INSTANCE.getCount('u-concurrent', 60_000);
      expect(count).toBe(concurrency);
    });
  });

  // ─── Stats ──────────────────────────────────────────────────────────────────

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