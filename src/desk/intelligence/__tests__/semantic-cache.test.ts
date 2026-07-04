/**
 * Semantic Cache Tests
 * Tests Redis-backed cache for dependency graphs
 *
 * Covers: hashMarketIds (determinism, ordering, collision resistance),
 * getCachedGraph (hit, miss, error paths),
 * setCachedGraph (write, error swallow),
 * invalidateCachedGraph (delete, error swallow)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DependencyGraph } from '../../../shared/types/semantic-relationships';

// --- Mock Redis using object references (works with vi.mock hoisting) ---
type GetHandler = (key: string) => Promise<string | null>;
type SetexHandler = (key: string, ttl: number, value: string) => Promise<unknown>;
type DelHandler = (key: string) => Promise<number>;

const mockBehaviors: {
  get: GetHandler;
  setex: SetexHandler;
  del: DelHandler;
} = {
  get: () => Promise.resolve(null),
  setex: () => Promise.resolve('OK'),
  del: () => Promise.resolve(1),
};

function buildRedisInstance() {
  return {
    get: (key: string) => mockBehaviors.get(key),
    setex: (key: string, ttl: number, value: string) => mockBehaviors.setex(key, ttl, value),
    del: (key: string) => mockBehaviors.del(key),
    on: () => {},
    quit: () => Promise.resolve('OK'),
  };
}

vi.mock('ioredis', () => ({
  default: buildRedisInstance,
  Redis: buildRedisInstance,
}));

// --- Sample data ---
const sampleGraph: DependencyGraph = {
  relationships: [
    {
      sourceMarketId: 'market_1',
      targetMarketId: 'market_2',
      relationshipType: 'correlation',
      strength: 0.85,
      metadata: { lagDays: 1 },
    },
  ],
  marketCount: 2,
  builtAt: 1700000000000,
  ttlSeconds: 3600,
};

describe('Semantic Cache', () => {
  beforeEach(() => {
    mockBehaviors.get = () => Promise.resolve(null);
    mockBehaviors.setex = () => Promise.resolve('OK');
    mockBehaviors.del = () => Promise.resolve(1);
  });

  describe('hashMarketIds', () => {
    it('should hash market IDs into stable string', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const marketIds = ['market_1', 'market_2', 'market_3'];
      const hash = hashMarketIds(marketIds);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce consistent hash for same input', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const marketIds = ['market_1', 'market_2', 'market_3'];

      const hash1 = hashMarketIds(marketIds);
      const hash2 = hashMarketIds(marketIds);

      expect(hash1).toBe(hash2);
    });

    it('should produce same hash for different order (order-independent)', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const ids1 = ['market_1', 'market_2'];
      const ids2 = ['market_2', 'market_1'];

      const hash1 = hashMarketIds(ids1);
      const hash2 = hashMarketIds(ids2);

      expect(hash1).toBe(hash2);
    });

    it('should handle single market', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const hash = hashMarketIds(['market_1']);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should handle many markets', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const marketIds = Array.from({ length: 100 }, (_, i) => `market_${i}`);
      const hash = hashMarketIds(marketIds);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should produce 16-character hex string', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const marketIds = ['market_1', 'market_2'];
      const hash = hashMarketIds(marketIds);

      expect(/^[0-9a-f]{16}$/.test(hash)).toBe(true);
    });

    it('should handle special characters in market IDs', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const marketIds = ['BTC/USD', 'ETH-USDT', 'XRP_PRICE'];
      const hash = hashMarketIds(marketIds);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16);
    });

    it('should be deterministic across multiple calls', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const marketIds = ['m1', 'm2', 'm3', 'm4', 'm5'];

      const hashes = Array.from({ length: 5 }, () => hashMarketIds(marketIds));

      expect(new Set(hashes).size).toBe(1);
    });

    it('should differ for different market sets', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const hash1 = hashMarketIds(['market_1', 'market_2']);
      const hash2 = hashMarketIds(['market_1', 'market_3']);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle duplicate markets in list', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const hash1 = hashMarketIds(['market_1', 'market_2']);
      const hash2 = hashMarketIds(['market_1', 'market_1', 'market_2']);

      expect(typeof hash1).toBe('string');
      expect(typeof hash2).toBe('string');
    });

    it('should produce consistent length regardless of input size', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const hash1 = hashMarketIds(['m1']);
      const hash2 = hashMarketIds(['m1', 'm2']);
      const hash3 = hashMarketIds(['m1', 'm2', 'm3', 'm4', 'm5']);

      expect(hash1.length).toBe(hash2.length);
      expect(hash2.length).toBe(hash3.length);
      expect(hash1.length).toBe(16);
    });

    it('should handle empty array', async () => {
      const { hashMarketIds } = await import('../semantic-cache');
      const hash = hashMarketIds([]);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16);
    });
  });

  describe('getCachedGraph', () => {
    it('should return parsed graph on cache hit', async () => {
      const { getCachedGraph } = await import('../semantic-cache');
      mockBehaviors.get = () => Promise.resolve(JSON.stringify(sampleGraph));

      const result = await getCachedGraph(['market_1', 'market_2']);

      expect(result).toEqual(sampleGraph);
    });

    it('should return null on cache miss', async () => {
      const { getCachedGraph } = await import('../semantic-cache');

      const result = await getCachedGraph(['market_1', 'market_2']);

      expect(result).toBeNull();
    });

    it('should return null on empty market IDs', async () => {
      const { getCachedGraph } = await import('../semantic-cache');

      const result = await getCachedGraph([]);

      expect(result).toBeNull();
    });

    it('should return null when Redis throws error', async () => {
      const { getCachedGraph } = await import('../semantic-cache');
      mockBehaviors.get = () => Promise.reject(new Error('Connection refused'));

      const result = await getCachedGraph(['market_1']);

      expect(result).toBeNull();
    });

    it('should return null on invalid JSON in cache', async () => {
      const { getCachedGraph } = await import('../semantic-cache');
      mockBehaviors.get = () => Promise.resolve('not valid json{{{{');

      const result = await getCachedGraph(['market_1']);

      expect(result).toBeNull();
    });

    it('should use key with semantic:deps: prefix', async () => {
      const { getCachedGraph } = await import('../semantic-cache');
      let calledKey = '';
      mockBehaviors.get = (key: string) => { calledKey = key; return Promise.resolve(null); };

      await getCachedGraph(['market_a']);

      expect(calledKey).toMatch(/^semantic:deps:/);
    });

    it('should produce same key for same market IDs in different order', async () => {
      const { getCachedGraph } = await import('../semantic-cache');
      const keys: string[] = [];
      mockBehaviors.get = (key: string) => { keys.push(key); return Promise.resolve(null); };

      await getCachedGraph(['b', 'a']);
      await getCachedGraph(['a', 'b']);

      expect(keys[0]).toBe(keys[1]);
    });
  });

  describe('setCachedGraph', () => {
    it('should store graph with Redis setex and TTL', async () => {
      const { setCachedGraph } = await import('../semantic-cache');
      let calledKey = '';
      let calledTtl = 0;
      let calledValue = '';
      mockBehaviors.setex = (key: string, ttl: number, value: string) => {
        calledKey = key;
        calledTtl = ttl;
        calledValue = value;
        return Promise.resolve('OK');
      };

      await setCachedGraph(['market_1', 'market_2'], sampleGraph);

      expect(calledKey).toMatch(/^semantic:deps:/);
      expect(calledTtl).toBe(3600);
      expect(JSON.parse(calledValue)).toEqual(sampleGraph);
    });

    it('should silently handle Redis write error', async () => {
      const { setCachedGraph } = await import('../semantic-cache');
      mockBehaviors.setex = () => Promise.reject(new Error('Write error'));

      await expect(setCachedGraph(['market_1'], sampleGraph)).resolves.toBeUndefined();
    });

    it('should produce same cache key as getCachedGraph', async () => {
      const { getCachedGraph, setCachedGraph } = await import('../semantic-cache');
      const keys: string[] = [];
      mockBehaviors.get = (key: string) => { keys.push(key); return Promise.resolve(null); };
      mockBehaviors.setex = (key: string) => { keys.push(key); return Promise.resolve('OK'); };

      await getCachedGraph(['x', 'y', 'z']);
      await setCachedGraph(['x', 'y', 'z'], sampleGraph);

      expect(keys[0]).toBe(keys[1]);
    });

    it('should store any valid DependencyGraph shape', async () => {
      const { setCachedGraph } = await import('../semantic-cache');
      let calledValue = '';
      mockBehaviors.setex = (_key: string, _ttl: number, value: string) => {
        calledValue = value;
        return Promise.resolve('OK');
      };

      const minimalGraph: DependencyGraph = {
        relationships: [],
        marketCount: 0,
        builtAt: 0,
        ttlSeconds: 3600,
      };

      await setCachedGraph(['empty'], minimalGraph);

      expect(JSON.parse(calledValue)).toEqual(minimalGraph);
    });
  });

  describe('invalidateCachedGraph', () => {
    it('should delete key from Redis', async () => {
      const { invalidateCachedGraph } = await import('../semantic-cache');
      let calledKey = '';
      mockBehaviors.del = (key: string) => { calledKey = key; return Promise.resolve(1); };

      await invalidateCachedGraph(['market_1', 'market_2']);

      expect(calledKey).toMatch(/^semantic:deps:/);
    });

    it('should silently handle Redis delete error', async () => {
      const { invalidateCachedGraph } = await import('../semantic-cache');
      mockBehaviors.del = () => Promise.reject(new Error('Delete error'));

      await expect(invalidateCachedGraph(['market_1'])).resolves.toBeUndefined();
    });

    it('should produce same cache key as getCachedGraph', async () => {
      const { getCachedGraph, invalidateCachedGraph } = await import('../semantic-cache');
      const keys: string[] = [];
      mockBehaviors.get = (key: string) => { keys.push(key); return Promise.resolve(null); };
      mockBehaviors.del = (key: string) => { keys.push(key); return Promise.resolve(1); };

      await getCachedGraph(['a']);
      await invalidateCachedGraph(['a']);

      expect(keys[0]).toBe(keys[1]);
    });

    it('should handle empty market IDs', async () => {
      const { invalidateCachedGraph } = await import('../semantic-cache');
      let called = false;
      mockBehaviors.del = () => { called = true; return Promise.resolve(0); };

      await invalidateCachedGraph([]);

      expect(called).toBe(true);
    });
  });

  describe('cross-function key consistency', () => {
    it('should maintain consistent key across hash, get, set, and invalidate', async () => {
      const { hashMarketIds, getCachedGraph, setCachedGraph, invalidateCachedGraph } = await import('../semantic-cache');
      const keys: string[] = [];
      mockBehaviors.get = (key: string) => { keys.push(key); return Promise.resolve(null); };
      mockBehaviors.setex = (key: string) => { keys.push(key); return Promise.resolve('OK'); };
      mockBehaviors.del = (key: string) => { keys.push(key); return Promise.resolve(1); };

      const marketIds = ['alpha', 'beta', 'gamma'];
      const hash = hashMarketIds(marketIds);

      await getCachedGraph(marketIds);
      await setCachedGraph(marketIds, sampleGraph);
      await invalidateCachedGraph(marketIds);

      expect(keys[0]).toBe(`semantic:deps:${hash}`);
      expect(keys[1]).toBe(`semantic:deps:${hash}`);
      expect(keys[2]).toBe(`semantic:deps:${hash}`);
    });
  });
});
