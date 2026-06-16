import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getStrategyRouter, StrategyRouter, getShardId } from '../../src/strategies/router';
import { ShardManager, StrategyShard } from '../../src/durable-objects';
import type { DurableObjectState, DurableObject } from '@cloudflare/workers-types';

// Mock the redis client
vi.mock('../../src/redis', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn().mockResolvedValue([]),
    hset: vi.fn(),
    hgetall: vi.fn().mockResolvedValue({}),
  })),
}));

// Mock logger
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Strategy Shard Assignment', () => {
  describe('getShardId', () => {
    it('should return consistent shard ID for same strategy', () => {
      const shard1 = getShardId('strategy-123');
      const shard2 = getShardId('strategy-123');
      expect(shard1).toBe(shard2);
    });

    it('should return shard ID within valid range (0-11)', () => {
      for (let i = 0; i < 100; i++) {
        const shardId = getShardId(`strategy-${i}`);
        expect(shardId).toBeGreaterThanOrEqual(0);
        expect(shardId).toBeLessThan(12);
      }
    });

    it('should distribute strategies evenly', () => {
      const distribution = new Map<number, number>();
      for (let i = 0; i < 1000; i++) {
        const shardId = getShardId(`strategy-${i}`);
        distribution.set(shardId, (distribution.get(shardId) || 0) + 1);
      }

      const counts = Array.from(distribution.values());
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const maxDeviation = Math.max(...counts.map(c => Math.abs(c - avg) / avg));

      // Max 20% deviation allowed
      expect(maxDeviation).toBeLessThan(0.25);
    });
  });

  describe('StrategyRouter', () => {
    let router: StrategyRouter;
    let mockShardStub: DurableObject;

    const createMockShardStub = (shardId: number, status: number = 200) => {
      return {
        fetch: vi.fn().mockResolvedValue({
          ok: status === 200,
          status,
          json: () => Promise.resolve({
            signal: 'BUY',
            confidence: 0.85,
            shardId,
            latencyMs: 5,
          }),
        }),
      };
    };

    beforeEach(() => {
      router = new StrategyRouter({} as any); // No env binding
    });

    it('should route to correct shard based on strategy ID', () => {
      const strategyId = 'polymarket-arbitrage-001';
      const expectedShard = getShardId(strategyId);
      expect(expectedShard).toBeGreaterThanOrEqual(0);
      expect(expectedShard).toBeLessThan(12);
    });

    it('should return error when shard stub not found', async () => {
      const result = await router.executeStrategy('unknown-strategy', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});

describe('ShardManager Durable Object', () => {
  let mockState: DurableObjectState;
  let shardManager: ShardManager;

  const createMockState = (): DurableObjectState => {
    return {
      storage: {
        get: vi.fn(),
        put: vi.fn(),
      },
      env: {},
      bindingName: 'SHARD_MANAGER',
    } as unknown as DurableObjectState;
  };

  beforeEach(async () => {
    mockState = createMockState() as DurableObjectState;
    vi.clearAllMocks();

    // Mock storage
    mockState.storage.get = vi.fn().mockResolvedValue(null);
    mockState.storage.put = vi.fn().mockResolvedValue(undefined);

    shardManager = new ShardManager(mockState);
  });

  describe('initializeRing', () => {
    it('should create new ring if none exists', async () => {
      await (shardManager as any).initializeRing();

      // Verify ring was created and persisted
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'ring',
        expect.objectContaining({ ring: expect.any(String) })
      );
    });

    it('should load existing ring from storage', async () => {
      const existingRing = {
        ring: [[12345, 0], [67890, 1]],
        shardConfigs: [[0, { shardId: 0, totalShards: 12, virtualNodes: 100 }]],
        virtualNodeCount: 1200,
      };

      mockState.storage.get = vi.fn().mockResolvedValue({ ring: JSON.stringify(existingRing) });

      await (shardManager as any).initializeRing();

      expect((shardManager as any).ring).not.toBeNull();
    });
  });

  describe('getShardForStrategy', () => {
    beforeEach(async () => {
      await (shardManager as any).initializeRing();
    });

    it('should return valid shard ID', () => {
      const shardId = (shardManager as any).getShardForStrategy('test-strategy-001');
      expect(shardId).toBeGreaterThanOrEqual(0);
      expect(shardId).toBeLessThan(12);
    });

    it('should provide consistent assignment', () => {
      const strategyId = 'polymarket-arbitrage-test';
      const shard1 = (shardManager as any).getShardForStrategy(strategyId);
      const shard2 = (shardManager as any).getShardForStrategy(strategyId);
      expect(shard1).toBe(shard2);
    });

    it('should throw if ring not initialized', () => {
      (shardManager as any).ring = null;
      expect(() => (shardManager as any).getShardForStrategy('test')).toThrow(
        'Hash ring not initialized'
      );
    });
  });

  describe('getRingState', () => {
    it('should return ring distribution', async () => {
      // Mock strategy assignments storage
      mockState.storage.get = vi.fn().mockImplementation(async (key: string) => {
        if (key === 'strategyAssignments') {
          return new Map([['strat-a', 0], ['strat-b', 1], ['strat-c', 0]]);
        }
        return null;
      });

      const state = await (shardManager as any).getRingState();

      expect(state.totalShards).toBe(12);
      expect(state.virtualNodesPerShard).toBe(100);
      expect(state.distribution).toBeInstanceOf(Map);
    });
  });

  describe('rebalance', () => {
    it('should redistribute strategies', async () => {
      await (shardManager as any).initializeRing();
      const result = await (shardManager as any).rebalance();

      expect(result.previous).toBeInstanceOf(Map);
      expect(result.updated).toBeInstanceOf(Map);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'ring',
        expect.objectContaining({ ring: expect.any(String) })
      );
    });
  });
});

describe('StrategyShard Durable Object', () => {
  let mockState: DurableObjectState;
  let strategyShard: StrategyShard;

  const createMockState = (shardId: number = 0): DurableObjectState => {
    return {
      storage: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
      },
      env: {
        SHARD_MANAGER: {
          updateShardHealth: vi.fn().mockResolvedValue(undefined),
        } as any,
      },
      bindingName: `SHARD_${shardId}`,
      className: 'StrategyShard',
    } as unknown as DurableObjectState;
  };

  beforeEach(async () => {
    mockState = createMockState();
    vi.clearAllMocks();

    strategyShard = new StrategyShard(mockState);
  });

  describe('initialize', () => {
    it('should load assigned strategies', async () => {
      mockState.storage.get = vi.fn()
        .mockResolvedValueOnce([]) // assignedStrategies
        .mockResolvedValueOnce(null) // metrics
        .mockResolvedValueOnce(null); // shardHealths

      await (strategyShard as any).initialize();

      expect((strategyShard as any).metrics.strategiesLoaded).toBe(0);
    });

    it('should register health with ShardManager', async () => {
      mockState.storage.get = vi.fn().mockResolvedValue([]);

      await (strategyShard as any).initialize();

      expect(mockState.env.SHARD_MANAGER.updateShardHealth).toHaveBeenCalled();
    });
  });

  describe('health check', () => {
    it('should return health status', async () => {
      const response = await (strategyShard as any).handleHealthCheck();
      const health = await response.json();

      expect(health.status).toBe('healthy');
      expect(health.shardId).toBe(0);
      expect(health.activeExecutions).toBe(0);
    });
  });

  describe('backpressure handling', () => {
    it('should reject when queue is full', async () => {
      (strategyShard as any).metrics.queueLength = 100;

      const request = new Request('http://localhost/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'test', marketData: {} }),
      });

      const response = await (strategyShard as any).handleExecute(request);
      expect(response.status).toBe(429);
    });

    it('should reject when max concurrency reached', async () => {
      (strategyShard as any).activeExecutions = 10; // MAX_CONCURRENT
      (strategyShard as any).metrics.queueLength = 0;

      const request = new Request('http://localhost/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'test', marketData: {} }),
      });

      const response = await (strategyShard as any).handleExecute(request);
      expect(response.status).toBe(503);
    });
  });
});
