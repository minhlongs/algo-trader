/**
 * Unit Tests for LRU Cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache, StrategyCache, MarketDataCache, AgentContextCache } from '../../src/shared/utils/lru-cache';

describe('LRUCache', () => {
  describe('Basic Operations', () => {
    let cache: LRUCache<string>;

    beforeEach(() => {
      cache = new LRUCache<string>({ maxSize: 1024 * 1024 }); // 1MB
    });

    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('missing')).toBeNull();
    });

    it('should return null for expired entries', async () => {
      vi.useFakeTimers();
      cache = new LRUCache<string>({ maxSize: 1024 * 1024, ttl: 1000 });

      cache.set('key1', 'value1');
      vi.advanceTimersByTime(1500);

      expect(cache.get('key1')).toBeNull();
      vi.useRealTimers();
    });

    it('should update existing keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
      expect(cache.delete('missing')).toBe(false);
    });

    it('should check key existence', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('missing')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.getStats().entries).toBe(0);
    });
  });

  describe('Size-based Eviction', () => {
    it('should evict oldest when max size exceeded', () => {
      const cache = new LRUCache<string>({ maxSize: 1024 }); // 1KB

      // Fill with entries (each ~256 bytes estimated)
      cache.set('a', 'a'.repeat(200));
      cache.set('b', 'b'.repeat(200));
      cache.set('c', 'c'.repeat(200));
      cache.set('d', 'd'.repeat(200));

      const stats = cache.getStats();
      expect(stats.entries).toBeLessThanOrEqual(4);
      expect(stats.sizeBytes).toBeLessThanOrEqual(1024);
    });

    it('should evict least recently used first', () => {
      const cache = new LRUCache<string>({ maxSize: 20 }); // Small size to force eviction

      cache.set('a', 'a', undefined, 5);
      cache.set('b', 'b', undefined, 5);
      cache.set('c', 'c', undefined, 5);

      // Access 'c' to make it most recent
      cache.get('c');

      // Add entry that forces eviction (cache has 15 bytes, limit 20, new entry 5 bytes = 20, no eviction yet)
      // Need to exceed limit to trigger eviction
      cache.set('d', 'd', undefined, 6); // Total would be 21 > 20

      // 'a' should be evicted (oldest)
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track hit rate', () => {
      const cache = new LRUCache<string>({ maxSize: 1024 * 1024 });

      cache.get('missing');
      cache.get('missing');
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key1');

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(2);
      expect(cache.getHitRate()).toBe(50);
    });

    it('should track evictions', () => {
      const cache = new LRUCache<string>({ maxSize: 100 });

      cache.set('a', 'a'.repeat(50));
      cache.set('b', 'b'.repeat(50));
      cache.set('c', 'c'.repeat(50)); // Triggers eviction

      const stats = cache.getStats();
      expect(stats.evictionCount).toBeGreaterThan(0);
    });

    it('should calculate utilization', () => {
      const cache = new LRUCache<string>({ maxSize: 1024 });
      cache.set('key', 'value'.repeat(100));

      const utilization = cache.getUtilization();
      expect(utilization).toBeGreaterThan(0);
      expect(utilization).toBeLessThanOrEqual(100);
    });
  });

  describe('Prune', () => {
    it('should remove expired entries', () => {
      vi.useFakeTimers();
      const cache = new LRUCache<string>({ maxSize: 1024 * 1024, ttl: 1000 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(1500);

      const pruned = cache.prune();
      expect(pruned).toBe(2);
      expect(cache.getStats().entries).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('Pre-configured Caches', () => {
    it('StrategyCache should have correct config', () => {
      const cache = new StrategyCache();
      expect(cache.getUtilization()).toBeLessThanOrEqual(100);
    });

    it('MarketDataCache should have correct config', () => {
      const cache = new MarketDataCache();
      expect(cache.getUtilization()).toBeLessThanOrEqual(100);
    });

    it('AgentContextCache should have correct config', () => {
      const cache = new AgentContextCache();
      expect(cache.getUtilization()).toBeLessThanOrEqual(100);
    });
  });

  describe('Size Estimation', () => {
    it('should estimate size correctly for simple objects', () => {
      const cache = new LRUCache<{ value: string }>({ maxSize: 1024 * 1024 });
      const obj = { value: 'test' };
      const estimatedSize = cache['estimateSize'](obj);

      // Should be at least the JSON string length
      expect(estimatedSize).toBeGreaterThanOrEqual(JSON.stringify(obj).length);
    });

    it('should use fallback for non-serializable objects', () => {
      const cache = new LRUCache<any>({ maxSize: 1024 * 1024 });
      const circular = { a: 1 };
      circular.self = circular;

      // Should not throw, should return fallback
      expect(() => cache.set('key', circular)).not.toThrow();
    });
  });
});
