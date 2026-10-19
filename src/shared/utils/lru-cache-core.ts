import type { CacheEntry, CacheStats, LRUCacheOptions } from './lru-cache-types';
import { estimateValueSize } from './lru-cache-helpers';
import { LRUCacheOperations } from './lru-cache-operations';

export class LRUCache<K extends string | number | symbol, V = unknown> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private maxSize: number; // in bytes
  private currentSize: number = 0;
  private ttl: number; // default TTL in ms
  private ops = new LRUCacheOperations<K, V>();

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 min default
  }

  get hitCount(): number {
    return this.ops.hitCount;
  }

  get missCount(): number {
    return this.ops.missCount;
  }

  get evictionCount(): number {
    return this.ops.evictionCount;
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.ops.recordMiss();
      return null;
    }

    if (entry.expiresAt < Date.now()) {
      this.delete(key);
      this.ops.recordMiss();
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, { ...entry, accessedAt: Date.now() });

    this.ops.recordHit();
    return entry.value;
  }

  set(key: K, value: V, ttl?: number, size?: number): void {
    const entrySize = size !== undefined ? size : this.estimateSize(value);
    const expiresAt = Date.now() + (ttl || this.ttl);

    while (this.currentSize + entrySize > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

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

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSize -= entry.size;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.ops.resetStats();
  }

  getStats(): CacheStats {
    return this.ops.getStats(this.cache.size, this.currentSize);
  }

  getHitRate(): number {
    return this.ops.getHitRate();
  }

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

  private evictOldest(): void {
    const oldestKey = this.ops.findOldestKey(this.cache);
    if (oldestKey !== null) {
      this.delete(oldestKey);
      this.ops.recordEviction(this.constructor.name);
    }
  }

  private estimateSize(value: V): number {
    return estimateValueSize(value);
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  values(): IterableIterator<CacheEntry<V>> {
    return this.cache.values();
  }

  getUtilization(): number {
    return (this.currentSize / this.maxSize) * 100;
  }
}
