import type { CacheEntry, CacheStats } from './lru-cache-types';
import { recordEvictionMetric } from './lru-cache-helpers';

/**
 * Handles eviction and statistics calculations for LRUCache.
 */
export class LRUCacheOperations<K extends string | number | symbol, V> {
  hitCount = 0;
  missCount = 0;
  evictionCount = 0;

  recordHit(): void {
    this.hitCount++;
  }

  recordMiss(): void {
    this.missCount++;
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.evictionCount = 0;
  }

  getStats(entryCount: number, currentSizeBytes: number): CacheStats {
    return {
      entries: entryCount,
      sizeBytes: currentSizeBytes,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
    };
  }

  getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? (this.hitCount / total) * 100 : 0;
  }

  /**
   * Find the least recently accessed key in the cache.
   */
  findOldestKey(cache: Map<K, CacheEntry<V>>): K | null {
    let oldestKey: K | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of cache.entries()) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Notify that an eviction occurred and record metrics.
   */
  recordEviction(className: string): void {
    this.evictionCount++;
    recordEvictionMetric(className);
  }
}
