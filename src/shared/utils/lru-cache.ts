/**
 * LRU Cache with Size-based Eviction
 * Memory-efficient caching with automatic eviction based on byte size
 *
 * Target: <10ms eviction latency, >80% hit rate for hot strategies
 */

import { recordCacheEviction } from '../middleware/prometheus-metrics';

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessedAt: number;
  size: number; // approximate memory size in bytes
}

export interface CacheStats {
  entries: number;
  sizeBytes: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
}

export class LRUCache<K extends string | number | symbol> {
  private cache: Map<K, CacheEntry<any>> = new Map();
  private maxSize: number; // in bytes
  private currentSize: number = 0;
  private ttl: number; // default TTL in ms

  // Stats tracking
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor(options: { maxSize: number; ttl?: number }) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 min default
  }

  /**
   * Get value from cache
   * Returns null if key not found or expired
   */
  get(key: K): any | null {
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
  set(key: K, value: any, ttl?: number, size?: number): void {
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
    const totalRequests = this.hitCount + this.missCount;
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

      // Record eviction in Prometheus metrics
      try {
        const cacheName = this.constructor.name;
        let cacheType: 'strategy' | 'market_data' | 'agent_context' = 'strategy';
        if (cacheName.includes('MarketData')) {
          cacheType = 'market_data';
        } else if (cacheName.includes('AgentContext')) {
          cacheType = 'agent_context';
        }
        recordCacheEviction(cacheType);
      } catch {
        // Ignore metric recording errors
      }
    }
  }

  /**
   * Estimate memory size of a value
   * Uses rough approximation based on JSON serialization
   */
  private estimateSize(value: any): number {
    try {
      // Rough estimate: JSON string length in bytes
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      // Fallback: use 1KB default
      return 1024;
    }
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
  values(): IterableIterator<CacheEntry<any>> {
    return this.cache.values();
  }

  /**
   * Get utilization percentage
   */
  getUtilization(): number {
    return (this.currentSize / this.maxSize) * 100;
  }
}

/**
 * Pre-configured caches for common use cases
 */
export class StrategyCache extends LRUCache<string> {
  constructor() {
    super({ maxSize: 20 * 1024 * 1024, ttl: 30 * 60 * 1000 }); // 20MB, 30min TTL
  }
}

export class MarketDataCache extends LRUCache<string> {
  constructor() {
    super({ maxSize: 10 * 1024 * 1024, ttl: 2 * 60 * 1000 }); // 10MB, 2min TTL
  }
}

export class AgentContextCache extends LRUCache<string> {
  constructor() {
    super({ maxSize: 15 * 1024 * 1024, ttl: 10 * 60 * 1000 }); // 15MB, 10min TTL
  }
}
