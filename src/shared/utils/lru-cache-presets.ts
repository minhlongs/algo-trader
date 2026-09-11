import { LRUCache } from './lru-cache-core';

/**
 * Pre-configured caches for common use cases
 */
export class StrategyCache extends LRUCache<string, unknown> {
  constructor() {
    super({ maxSize: 20 * 1024 * 1024, ttl: 30 * 60 * 1000 }); // 20MB, 30min TTL
  }
}

export class MarketDataCache extends LRUCache<string, unknown> {
  constructor() {
    super({ maxSize: 10 * 1024 * 1024, ttl: 2 * 60 * 1000 }); // 10MB, 2min TTL
  }
}

export class AgentContextCache extends LRUCache<string, unknown> {
  constructor() {
    super({ maxSize: 15 * 1024 * 1024, ttl: 10 * 60 * 1000 }); // 15MB, 10min TTL
  }
}
