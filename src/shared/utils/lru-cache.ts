/**
 * LRU Cache with Size-based Eviction
 * Memory-efficient caching with automatic eviction based on byte size
 *
 * Target: <10ms eviction latency, >80% hit rate for hot strategies
 */

export type { CacheEntry, CacheStats, LRUCacheOptions } from './lru-cache-types';
export { LRUCache } from './lru-cache-core';
export { StrategyCache, MarketDataCache, AgentContextCache } from './lru-cache-presets';
