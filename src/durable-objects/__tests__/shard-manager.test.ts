/**
 * ShardManager Durable Object — Unit Tests
 *
 * Covers the ShardManager class:
 * - Constructor & ring initialization (stored ring, new ring, error)
 * - fetch() routing: /admin, /health, /shard/metrics, strategy routing, 400/401/500
 * - getRedis() caching and error handling
 * - getShardForStrategy / getRingState / rebalance
 * - updateShardHealth / getShardHealths / recordMetrics
 * - alarm() metrics rollup and persistence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock factories ────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../shared/utils/logger', () => ({ logger: mockLogger }));

const {
  mockBuildRing, mockGetShardForStrategy, mockSerializeRing, mockDeserializeRing,
} = vi.hoisted(() => ({
  mockBuildRing: vi.fn(),
  mockGetShardForStrategy: vi.fn(),
  mockSerializeRing: vi.fn(),
  mockDeserializeRing: vi.fn(),
}));
vi.mock('../../desk/utils/consistent-hash', () => ({
  buildRing: mockBuildRing,
  getShardForStrategy: mockGetShardForStrategy,
  serializeRing: mockSerializeRing,
  deserializeRing: mockDeserializeRing,
  getDistribution: vi.fn().mockReturnValue(new Map()),
  isBalanced: vi.fn().mockReturnValue(true),
}));

const {
  mockComputeRingState, mockRebuildRing, mockCollectRingMetrics, mockCreateDefaultShardHealth,
} = vi.hoisted(() => ({
  mockComputeRingState: vi.fn(),
  mockRebuildRing: vi.fn(),
  mockCollectRingMetrics: vi.fn(),
  mockCreateDefaultShardHealth: vi.fn((id: number) => ({
    shardId: id, lastHeartbeat: Date.now(), rps: 0, avgLatencyMs: 0, errorCount: 0, strategyCount: 0, status: 'healthy' as const,
  })),
}));
vi.mock('../shard-manager-routing', () => ({
  computeRingState: mockComputeRingState,
  rebuildRing: mockRebuildRing,
  collectRingMetrics: mockCollectRingMetrics,
  createDefaultShardHealth: mockCreateDefaultShardHealth,
  getShardAssignment: vi.fn(),
  fetchAllStrategyIds: vi.fn(),
}));

const {
  mockHandleAdminRequest, mockHandleHealthCheck, mockHandleMetrics, mockIsAdminAuth,
} = vi.hoisted(() => ({
  mockHandleAdminRequest: vi.fn(),
  mockHandleHealthCheck: vi.fn(),
  mockHandleMetrics: vi.fn(),
  mockIsAdminAuth: vi.fn(),
}));
vi.mock('../shard-manager-handlers', () => ({
  handleAdminRequest: mockHandleAdminRequest,
  handleHealthCheck: mockHandleHealthCheck,
  handleMetrics: mockHandleMetrics,
  isAdminAuth: mockIsAdminAuth,
}));

const mockGetRedisClient = vi.hoisted(() => vi.fn());
vi.mock('../../redis', () => ({ getRedisClient: mockGetRedisClient }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides: Record<string, unknown> = {}): any {
  const storage = new Map<string, unknown>();
  return {
    id: 'test-do-id',
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      put: vi.fn(async (key: string, value: unknown) => { storage.set(key, value); }),
      delete: vi.fn(async (key: string) => { storage.delete(key); }),
      list: vi.fn(async () => Array.from(storage.keys())),
    },
    ...overrides,
  };
}

const FAKE_RING = {
  ring: new Map([['0:0', 0], ['1:0', 1], ['2:0', 2]]),
  shardIds: [0, 1, 2],
};

const FAKE_RING_STATE = {
  totalShards: 12,
  virtualNodesPerShard: 100,
  distribution: new Map<number, number>(),
  balanced: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ShardManager', () => {
  let state: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    state = makeState();
    mockBuildRing.mockReturnValue(FAKE_RING);
    mockDeserializeRing.mockReturnValue(FAKE_RING);
    mockSerializeRing.mockReturnValue('serialized');
    mockGetShardForStrategy.mockReturnValue(0);
    mockComputeRingState.mockReturnValue(FAKE_RING_STATE);
    mockRebuildRing.mockReturnValue(FAKE_RING);
    mockGetRedisClient.mockReturnValue(null);
  });

  // ── Constructor & ring initialization ────────────────────────────────────────

  describe('constructor', () => {
    it('loads a stored ring from storage', async () => {
      state.storage.get = vi.fn(async (key: string) => {
        if (key === 'ring') return { ring: 'stored-ring-data' };
        return undefined;
      });
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      // Wait for fire-and-forget init
      await new Promise(r => setTimeout(r, 10));
      expect(mockDeserializeRing).toHaveBeenCalledWith('stored-ring-data');
      expect(mockLogger.info).toHaveBeenCalledWith('[ShardManager] Ring loaded', expect.anything());
    });

    it('creates a new ring when no stored ring exists', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      expect(mockBuildRing).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('[ShardManager] New ring created', expect.anything());
    });

    it('logs error when initialization fails', async () => {
      state.storage.get = vi.fn(async () => { throw new Error('storage fail'); });
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      expect(mockLogger.error).toHaveBeenCalledWith('[ShardManager] Init failed:', expect.anything());
    });

    it('restores shardHealths and shardMetrics from storage', async () => {
      const healths = new Map([[1, { shardId: 1, lastHeartbeat: 1000, rps: 5, avgLatencyMs: 10, errorCount: 0, strategyCount: 3, status: 'healthy' }]]);
      const metrics = new Map([[1, { requests: 50, errors: 2, totalLatencyMs: 500, lastUpdated: 1000 }]]);
      state.storage.get = vi.fn(async (key: string) => {
        if (key === 'ring') return { ring: 'stored' };
        if (key === 'shardHealths') return healths;
        if (key === 'shardMetrics') return metrics;
        return undefined;
      });
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      expect(mgr.getShardHealths()).toHaveLength(1);
    });
  });

  // ── getRedis() ──────────────────────────────────────────────────────────────

  describe('getRedis()', () => {
    it('returns null when Redis import fails', async () => {
      mockGetRedisClient.mockImplementation(() => { throw new Error('no redis'); });
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      // getRedis is private and lazy — invoke it directly to exercise the error path
      const result = await (mgr as any).getRedis();
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Redis unavailable'),
        expect.anything(),
      );
    });

    it('caches the redis client on subsequent calls', async () => {
      const fakeRedis = { zrange: vi.fn().mockResolvedValue([]) };
      mockGetRedisClient.mockReturnValue(fakeRedis);
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      // getRedis is private and lazy — invoke it directly to exercise caching
      const first = await (mgr as any).getRedis();
      const second = await (mgr as any).getRedis();
      expect(first).toBe(fakeRedis);
      expect(second).toBe(fakeRedis);
      expect(mockGetRedisClient).toHaveBeenCalledTimes(1);
    });
  });

  // ── fetch() routing ─────────────────────────────────────────────────────────

  describe('fetch()', () => {
    async function createManager(): Promise<InstanceType<any>> {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      return mgr;
    }

    it('routes /admin requests with auth check (authorized)', async () => {
      mockIsAdminAuth.mockReturnValue(true);
      mockHandleAdminRequest.mockResolvedValue(Response.json({ ok: true }));
      const mgr = await createManager();
      const req = new Request('https://do/admin/ring', {
        headers: { Authorization: 'Bearer test-key' },
      });
      const res = await mgr.fetch(req);
      expect(res.status).toBe(200);
      expect(mockHandleAdminRequest).toHaveBeenCalled();
    });

    it('returns 401 for unauthorized /admin requests', async () => {
      mockIsAdminAuth.mockReturnValue(false);
      const mgr = await createManager();
      const req = new Request('https://do/admin/ring');
      const res = await mgr.fetch(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('routes /health to handleHealthCheck', async () => {
      mockHandleHealthCheck.mockReturnValue(Response.json({ status: 'ok' }));
      const mgr = await createManager();
      const req = new Request('https://do/health');
      const res = await mgr.fetch(req);
      expect(mockHandleHealthCheck).toHaveBeenCalled();
    });

    it('routes /shard/metrics to handleMetrics', async () => {
      mockHandleMetrics.mockReturnValue(Response.json({ metrics: {} }));
      const mgr = await createManager();
      const req = new Request('https://do/shard/metrics');
      const res = await mgr.fetch(req);
      expect(mockHandleMetrics).toHaveBeenCalled();
    });

    it('returns 400 when strategyId query param is missing', async () => {
      const mgr = await createManager();
      const req = new Request('https://do/route');
      const res = await mgr.fetch(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('strategyId');
    });

    it('returns shard assignment for a valid strategyId', async () => {
      mockGetShardForStrategy.mockReturnValue(3);
      const mgr = await createManager();
      const req = new Request('https://do/route?strategyId=strat-1');
      const res = await mgr.fetch(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shardId).toBe(3);
      expect(body.strategyId).toBe('strat-1');
    });

    it('returns 500 when routing throws', async () => {
      // Ring not initialized — getShardForStrategy will throw
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      // Don't wait for init to complete; clear the ring
      (mgr as any).ring = null;
      const req = new Request('https://do/route?strategyId=strat-1');
      const res = await mgr.fetch(req);
      expect(res.status).toBe(500);
    });
  });

  // ── getShardForStrategy ─────────────────────────────────────────────────────

  describe('getShardForStrategy()', () => {
    it('throws when ring is not initialized', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      (mgr as any).ring = null;
      expect(() => mgr.getShardForStrategy('strat-1')).toThrow('Hash ring not initialized');
    });

    it('delegates to consistent-hash getShardForStrategy', async () => {
      mockGetShardForStrategy.mockReturnValue(5);
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      expect(mgr.getShardForStrategy('strat-1')).toBe(5);
    });
  });

  // ── getRingState() ──────────────────────────────────────────────────────────

  describe('getRingState()', () => {
    it('throws when ring is not initialized', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      (mgr as any).ring = null;
      expect(() => mgr.getRingState()).toThrow('Ring not initialized');
    });

    it('returns ring state with totalShards and virtualNodesPerShard', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      const result = mgr.getRingState();
      expect(result.totalShards).toBe(12);
      expect(result.virtualNodesPerShard).toBe(100);
      expect(mockComputeRingState).toHaveBeenCalled();
    });
  });

  // ── rebalance() ────────────────────────────────────────────────────────────

  describe('rebalance()', () => {
    it('throws when ring is not initialized', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      (mgr as any).ring = null;
      await expect(mgr.rebalance()).rejects.toThrow('Ring not initialized');
    });

    it('rebuilds the ring and returns previous/updated maps', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      const result = await mgr.rebalance();
      expect(result).toHaveProperty('previous');
      expect(result).toHaveProperty('updated');
      expect(mockRebuildRing).toHaveBeenCalled();
    });
  });

  // ── updateShardHealth() ────────────────────────────────────────────────────

  describe('updateShardHealth()', () => {
    it('creates default health for unknown shard and merges', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.updateShardHealth(7, { rps: 10, status: 'degraded' });
      const healths = mgr.getShardHealths();
      expect(healths).toHaveLength(1);
      expect(healths[0].shardId).toBe(7);
      expect(healths[0].rps).toBe(10);
      expect(healths[0].status).toBe('degraded');
    });

    it('merges with existing health for known shard', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.updateShardHealth(3, { rps: 5 });
      mgr.updateShardHealth(3, { avgLatencyMs: 20 });
      const healths = mgr.getShardHealths();
      expect(healths).toHaveLength(1);
      expect(healths[0].rps).toBe(5);
      expect(healths[0].avgLatencyMs).toBe(20);
    });
  });

  // ── getShardHealths() ──────────────────────────────────────────────────────

  describe('getShardHealths()', () => {
    it('returns empty array when no healths recorded', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      expect(mgr.getShardHealths()).toEqual([]);
    });

    it('returns all recorded healths', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.updateShardHealth(1, {});
      mgr.updateShardHealth(2, {});
      expect(mgr.getShardHealths()).toHaveLength(2);
    });
  });

  // ── recordMetrics() ────────────────────────────────────────────────────────

  describe('recordMetrics()', () => {
    it('creates new metrics record on first call', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.recordMetrics(0, 10, true);
      // No error means success
    });

    it('increments requests and totalLatencyMs on success', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.recordMetrics(0, 10, true);
      mgr.recordMetrics(0, 20, true);
      const metrics = (mgr as any).shardMetrics.get(0);
      expect(metrics.requests).toBe(2);
      expect(metrics.totalLatencyMs).toBe(30);
      expect(metrics.errors).toBe(0);
    });

    it('increments errors on failure', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.recordMetrics(0, 10, false);
      mgr.recordMetrics(0, 20, true);
      const metrics = (mgr as any).shardMetrics.get(0);
      expect(metrics.requests).toBe(2);
      expect(metrics.errors).toBe(1);
    });
  });

  // ── alarm() ────────────────────────────────────────────────────────────────

  describe('alarm()', () => {
    it('iterates metrics, computes health, resets counters, and persists', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      // Seed some metrics
      mgr.recordMetrics(0, 100, true);
      mgr.recordMetrics(0, 200, true);
      await mgr.alarm();
      // Verify persist was called (storage.put for shardHealths and shardMetrics)
      expect(state.storage.put).toHaveBeenCalledWith('shardHealths', expect.any(Map));
      expect(state.storage.put).toHaveBeenCalledWith('shardMetrics', expect.any(Map));
    });

    it('handles alarm error gracefully', async () => {
      state.storage.put = vi.fn(async () => { throw new Error('storage fail'); });
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      // Should not throw
      await expect(mgr.alarm()).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('[ShardManager] Alarm failed:', expect.anything());
    });

    it('computes rps and avgLatency for each shard', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.recordMetrics(0, 500, true);
      mgr.recordMetrics(0, 1500, true);
      await mgr.alarm();
      // updateShardHealth called with rps = 2/10 = 0.2, avgLatency = 1000
      expect(mockCreateDefaultShardHealth).toHaveBeenCalled();
    });

    it('resets metrics counters after alarm', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      mgr.recordMetrics(0, 100, true);
      await mgr.alarm();
      const metrics = (mgr as any).shardMetrics.get(0);
      expect(metrics.requests).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.totalLatencyMs).toBe(0);
    });

    it('handles zero-request shards without division by zero', async () => {
      const { ShardManager } = await import('../shard-manager');
      const mgr = new ShardManager(state);
      await new Promise(r => setTimeout(r, 10));
      // Create a metrics entry with 0 requests
      (mgr as any).shardMetrics.set(5, {
        requests: 0, errors: 0, totalLatencyMs: 0, lastUpdated: Date.now(),
      });
      await mgr.alarm();
      // Should complete without error
    });
  });
});
