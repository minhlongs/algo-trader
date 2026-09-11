import type { CacheEntry, CacheStats, LRUCacheOptions } from './lru-cache-types';
import { estimateValueSize, recordEvictionMetric } from './lru-cache-helpers';

export class LRUCache<K extends string | number | symbol, V = unknown> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private maxSize: number; // in bytes
  private currentSize: number = 0;
  private ttl: number; // default TTL in ms

  // Stats tracking
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 min default
  }

  /**
   * Get value from cache
   * Returns null if key not found or expired
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    // Check expiration
    if (entry.expiresAt < Date.now()) {
      this.delete(key);
      this.missCount++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, accessedAt: Date.now() });

    this.hitCount++;
    return entry.value;
  }

  /**
   * Set value in cache with optional TTL and size
   */
  set(key: K, value: V, ttl?: number, size?: number): void {
    // Calculate approximate size if not provided
    const entrySize = size !== undefined ? size : this.estimateSize(value);
    const expiresAt = Date.now() + (ttl || this.ttl);

    // Evict if needed
    while (this.currentSize + entrySize > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    // Evict existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.cache.delete(key);
    }

    this.cache.set(key, {
      value,
      expiresAt,
      accessedAt: Date.now(),
      size: entrySize,
    });
    this.currentSize += entrySize;
  }

  /**
   * Check if key exists (without updating access time)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.evictionCount = 0;
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      evictionCount: this.evictionCount,
    };
  }

  /**
   * Get hit rate as percentage
   */
  getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? (this.hitCount / total) * 100 : 0;
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    let pruned = 0;
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.currentSize -= entry.size;
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Evict oldest (least recently used) entry
   */
  private evictOldest(): void {
    let oldestKey: K | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < oldestAccess) {
        oldestAccess = entry.accessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.delete(oldestKey);
      this.evictionCount++;
      recordEvictionMetric(this.constructor.name);
    }
  }

  /**
   * Estimate memory size of a value (kept for internal use and white-box test compatibility)
   */
  private estimateSize(value: V): number {
    return estimateValueSize(value);
  }

  /**
   * Get keys iterator (for debugging)
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * Get values iterator (for debugging)
   */
  values(): IterableIterator<CacheEntry<V>> {
    return this.cache.values();
  }

  /**
   * Get utilization percentage
   */
  getUtilization(): number {
    return (this.currentSize / this.maxSize) * 100;
  }
}
