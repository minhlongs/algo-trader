import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '../token-bucket-rate-limiter';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic token consumption', () => {
    it('should allow consumption when tokens are available', () => {
      const bucket = new TokenBucketRateLimiter(5, 1); // capacity=5, 1 token/sec
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(3);
    });

    it('should reject when tokens are exhausted', () => {
      const bucket = new TokenBucketRateLimiter(2, 1); // capacity=2
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.tryConsume()).toBe(false); // exhausted
    });
  });

  describe('refill behavior', () => {
    it('should refill tokens over time', () => {
      const bucket = new TokenBucketRateLimiter(3, 2); // capacity=3, 2 tokens/sec
      // Consume all
      bucket.tryConsume();
      bucket.tryConsume();
      bucket.tryConsume();
      expect(bucket.tryConsume()).toBe(false);

      // Advance 1 second → should refill 2 tokens
      vi.advanceTimersByTime(1000);
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.tryConsume()).toBe(true);
      expect(bucket.tryConsume()).toBe(false);
    });

    it('should not exceed capacity', () => {
      const bucket = new TokenBucketRateLimiter(3, 10); // capacity=3, fast refill
      // Wait a long time
      vi.advanceTimersByTime(10_000); // would be 100 tokens without cap
      expect(bucket.getAvailableTokens()).toBe(3); // capped at capacity
    });
  });

  describe('reset', () => {
    it('should restore tokens to full capacity', () => {
      const bucket = new TokenBucketRateLimiter(5, 1);
      bucket.tryConsume();
      bucket.tryConsume();
      bucket.tryConsume();
      expect(bucket.getAvailableTokens()).toBe(2);

      bucket.reset();
      expect(bucket.getAvailableTokens()).toBe(5);
    });
  });

  describe('per-strategy isolation', () => {
    it('should maintain independent buckets per strategy', () => {
      const bucketA = new TokenBucketRateLimiter(2, 1);
      const bucketB = new TokenBucketRateLimiter(2, 1);

      // Exhaust bucket A
      bucketA.tryConsume();
      bucketA.tryConsume();
      expect(bucketA.tryConsume()).toBe(false);

      // bucket B still has capacity
      expect(bucketB.tryConsume()).toBe(true);
    });
  });

  describe('burst capacity', () => {
    it('should allow burst up to capacity', () => {
      const bucket = new TokenBucketRateLimiter(10, 1); // capacity=10
      for (let i = 0; i < 10; i++) {
        expect(bucket.tryConsume()).toBe(true);
      }
      expect(bucket.tryConsume()).toBe(false); // 11th fails
    });
  });
});
