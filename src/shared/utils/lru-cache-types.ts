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

export interface LRUCacheOptions {
  maxSize: number;
  ttl?: number;
}
