/**
 * Tests for semantic-cache — Redis-backed cache for DependencyGraphs.
 * Covers hashMarketIds, getCachedGraph, setCachedGraph, invalidateCachedGraph.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const redisMock = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
};

vi.mock('../../../redis/index', () => ({
  getRedisClient: () => redisMock,
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { hashMarketIds, getCachedGraph, setCachedGraph, invalidateCachedGraph } from '../semantic-cache';

describe('semantic-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashMarketIds', () => {
    it('produces a stable 16-char hex hash', () => {
      const h1 = hashMarketIds(['BTC-USD', 'ETH-USD']);
      const h2 = hashMarketIds(['BTC-USD', 'ETH-USD']);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is order-independent (sorts before hashing)', () => {
      const h1 = hashMarketIds(['BTC-USD', 'ETH-USD']);
      const h2 = hashMarketIds(['ETH-USD', 'BTC-USD']);
      expect(h1).toBe(h2);
    });

    it('differs for different market sets', () => {
      const h1 = hashMarketIds(['BTC-USD']);
      const h2 = hashMarketIds(['BTC-USD', 'ETH-USD']);
      expect(h1).not.toBe(h2);
    });

    it('handles empty array', () => {
      const h = hashMarketIds([]);
      expect(h).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('getCachedGraph', () => {
    it('returns null on cache miss', async () => {
      redisMock.get.mockResolvedValue(null);
      const result = await getCachedGraph(['BTC-USD']);
      expect(result).toBeNull();
      expect(redisMock.get).toHaveBeenCalledWith('semantic:deps:' + hashMarketIds(['BTC-USD']));
    });

    it('returns parsed DependencyGraph on cache hit', async () => {
      const graph = { nodes: ['BTC-USD'], edges: [], metadata: { confidence: 0.9 } };
      redisMock.get.mockResolvedValue(JSON.stringify(graph));
      const result = await getCachedGraph(['BTC-USD']);
      expect(result).toEqual(graph);
    });

    it('returns null on JSON parse error', async () => {
      redisMock.get.mockResolvedValue('not-json');
      const result = await getCachedGraph(['BTC-USD']);
      expect(result).toBeNull();
    });

    it('returns null and logs on Redis error', async () => {
      redisMock.get.mockRejectedValue(new Error('Redis down'));
      const result = await getCachedGraph(['BTC-USD']);
      expect(result).toBeNull();
      // warn is called
      const { logger } = await import('../../../shared/utils/logger');
      expect(logger.warn).toHaveBeenCalledWith('[SemanticCache] Cache read error', expect.any(Object));
    });
  });

  describe('setCachedGraph', () => {
    it('serializes and stores with setex TTL', async () => {
      const graph = { nodes: ['BTC-USD', 'ETH-USD'], edges: [{ from: 'BTC-USD', to: 'ETH-USD', weight: 0.5 }] };
      redisMock.setex.mockResolvedValue('OK');
      await setCachedGraph(['BTC-USD', 'ETH-USD'], graph);
      expect(redisMock.setex).toHaveBeenCalledWith(
        'semantic:deps:' + hashMarketIds(['BTC-USD', 'ETH-USD']),
        3600,
        JSON.stringify(graph),
      );
    });

    it('swallows Redis write errors silently', async () => {
      redisMock.setex.mockRejectedValue(new Error('write fail'));
      await expect(setCachedGraph(['BTC-USD'], {})).resolves.toBeUndefined();
      const { logger } = await import('../../../shared/utils/logger');
      expect(logger.warn).toHaveBeenCalledWith('[SemanticCache] Cache write error', expect.any(Object));
    });
  });

  describe('invalidateCachedGraph', () => {
    it('deletes the key', async () => {
      redisMock.del.mockResolvedValue(1);
      await invalidateCachedGraph(['BTC-USD']);
      expect(redisMock.del).toHaveBeenCalledWith('semantic:deps:' + hashMarketIds(['BTC-USD']));
    });

    it('logs info on success', async () => {
      redisMock.del.mockResolvedValue(1);
      await invalidateCachedGraph(['BTC-USD']);
      const { logger } = await import('../../../shared/utils/logger');
      expect(logger.info).toHaveBeenCalledWith('[SemanticCache] Invalidated semantic:deps:' + hashMarketIds(['BTC-USD']));
    });

    it('logs warn on Redis error', async () => {
      redisMock.del.mockRejectedValue(new Error('del fail'));
      await invalidateCachedGraph(['BTC-USD']);
      const { logger } = await import('../../../shared/utils/logger');
      expect(logger.warn).toHaveBeenCalledWith('[SemanticCache] Cache invalidation error', expect.any(Object));
    });
  });
});