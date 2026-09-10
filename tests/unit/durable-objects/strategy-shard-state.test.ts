/**
 * StrategyShardState Tests
 * Covers: extractShardId, getRedisClient (singleton + error),
 * getStrategyAssignments (redis-hit/storage-hit/empty),
 * restoreMetrics (compressed/uncompressed/legacy/missing/error),
 * persistMetrics (success/error-fallback), persistHealth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockSmembers = vi.fn();
  const mockHset = vi.fn();
  const mockRedisClient = { smembers: mockSmembers, hset: mockHset };
  const mockStorageGet = vi.fn();
  const mockStoragePut = vi.fn();
  const mockCompressData = vi.fn();
  const mockDecompressData = vi.fn();
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const mockUpdateShardHealth = vi.fn().mockResolvedValue(undefined);
  const mockLoadStrategy = vi.fn().mockResolvedValue(null);
  return {
    mockSmembers, mockHset, mockRedisClient,
    mockStorageGet, mockStoragePut,
    mockCompressData, mockDecompressData, mockLogger,
    mockUpdateShardHealth, mockLoadStrategy,
  };
});

vi.mock('../../../src/redis', () => ({
  getRedisClient: vi.fn().mockReturnValue(mocks.mockRedisClient),
}));

vi.mock('../../../src/durable-objects/shard-compression', () => ({
  compressData: (...args: unknown[]) => mocks.mockCompressData(...args),
  decompressData: (...args: unknown[]) => mocks.mockDecompressData(...args),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: mocks.mockLogger,
}));

vi.mock('../../../src/durable-objects/shard-manager', () => ({
  ShardManager: vi.fn().mockImplementation(function () {
    return { updateShardHealth: mocks.mockUpdateShardHealth };
  }),
}));

vi.mock('../../../src/desk/strategies/loader', () => ({
  StrategyLoader: vi.fn().mockImplementation(function () {
    return { loadStrategy: mocks.mockLoadStrategy };
  }),
}));

import { getRedisClient as realGetRedisClient } from '../../../src/redis';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(id: string) {
  return {
    id: { toString: () => id },
    storage: { get: mocks.mockStorageGet, put: mocks.mockStoragePut },
  } as any;
}

function makeStorage() {
  return { get: mocks.mockStorageGet, put: mocks.mockStoragePut } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('strategy-shard-state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ── extractShardId ──────────────────────────────────────────────────────────

  describe('extractShardId', () => {
    it('returns deterministic shard ID (0-11) from state.id', async () => {
      const { extractShardId } = await import('../../../src/durable-objects/strategy-shard-state');
      const state = makeState('abc-123');
      const shardId = extractShardId(state);
      expect(shardId).toBeGreaterThanOrEqual(0);
      expect(shardId).toBeLessThanOrEqual(11);
    });

    it('same ID always maps to same shard', async () => {
      const { extractShardId } = await import('../../../src/durable-objects/strategy-shard-state');
      const s1 = makeState('do-id-xyz');
      const s2 = makeState('do-id-xyz');
      expect(extractShardId(s1)).toBe(extractShardId(s2));
    });

    it('different IDs can map to different shards', async () => {
      const { extractShardId } = await import('../../../src/durable-objects/strategy-shard-state');
      const ids = ['id-a', 'id-b', 'id-c', 'id-d', 'id-e', 'id-f'];
      const shards = ids.map(id => extractShardId(makeState(id)));
      expect(new Set(shards).size).toBeGreaterThan(1);
    });

    it('handles empty string ID', async () => {
      const { extractShardId } = await import('../../../src/durable-objects/strategy-shard-state');
      const shardId = extractShardId(makeState(''));
      expect(shardId).toBeGreaterThanOrEqual(0);
      expect(shardId).toBeLessThanOrEqual(11);
    });
  });

  // ── getRedisClient ──────────────────────────────────────────────────────────

  describe('getRedisClient', () => {
    it('returns cached instance on second call', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      const { getRedisClient: freshGet } = await import('../../../src/durable-objects/strategy-shard-state');
      const r1 = await freshGet();
      const r2 = await freshGet();
      expect(r1).toBe(r2);
    });

    it('returns null when redis import fails', async () => {
      (realGetRedisClient as any).mockImplementation(() => { throw new Error('no redis'); });
      const { getRedisClient: freshGet } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await freshGet();
      expect(result).toBeNull();
      expect(mocks.mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ── getStrategyAssignments ──────────────────────────────────────────────────

  describe('getStrategyAssignments', () => {
    it('returns cached strategies from redis when available', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockSmembers.mockResolvedValue(['s1', 's2']);
      const { getStrategyAssignments: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await freshFn(3, makeStorage());
      expect(result).toEqual(['s1', 's2']);
      expect(mocks.mockSmembers).toHaveBeenCalledWith('shard:3:strategies');
    });

    it('falls back to storage when redis returns empty', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockSmembers.mockResolvedValue([]);
      mocks.mockStorageGet.mockResolvedValue(['s3', 's4']);
      const { getStrategyAssignments: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await freshFn(5, makeStorage());
      expect(result).toEqual(['s3', 's4']);
    });

    it('returns empty array when nothing found', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockSmembers.mockResolvedValue([]);
      mocks.mockStorageGet.mockResolvedValue(undefined);
      const { getStrategyAssignments: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await freshFn(1, makeStorage());
      expect(result).toEqual([]);
      expect(mocks.mockLogger.warn).toHaveBeenCalled();
    });
  });

  // ── restoreMetrics ──────────────────────────────────────────────────────────

  describe('restoreMetrics', () => {
    const defaultMetrics = {
      requests: 0, totalLatencyMs: 0, errors: 0,
      queueLength: 0, strategiesLoaded: 0, lastUpdated: 0,
    };

    it('returns default metrics when storage is empty', async () => {
      mocks.mockStorageGet.mockResolvedValue(undefined);
      const { restoreMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await restoreMetrics(makeStorage());
      expect(result).toEqual(defaultMetrics);
    });

    it('restores compressed metrics', async () => {
      const raw = JSON.stringify({ requests: 42, totalLatencyMs: 100, errors: 1, queueLength: 0, strategiesLoaded: 5, lastUpdated: 123 });
      mocks.mockStorageGet.mockResolvedValue({ data: 'compressed-blob', compressed: true });
      mocks.mockDecompressData.mockResolvedValue(raw);
      const { restoreMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await restoreMetrics(makeStorage());
      expect(result.requests).toBe(42);
      expect(result.strategiesLoaded).toBe(5);
      expect(mocks.mockDecompressData).toHaveBeenCalledWith('compressed-blob');
    });

    it('restores uncompressed JSON data format', async () => {
      const raw = JSON.stringify({ requests: 10, totalLatencyMs: 50, errors: 0, queueLength: 0, strategiesLoaded: 2, lastUpdated: 999 });
      mocks.mockStorageGet.mockResolvedValue({ data: raw, compressed: false });
      const { restoreMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await restoreMetrics(makeStorage());
      expect(result.requests).toBe(10);
      expect(result.lastUpdated).toBe(999);
    });

    it('restores legacy format (raw object)', async () => {
      const legacy = { requests: 7, totalLatencyMs: 30, errors: 2, queueLength: 1, strategiesLoaded: 3, lastUpdated: 500 };
      mocks.mockStorageGet.mockResolvedValue(legacy);
      const { restoreMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await restoreMetrics(makeStorage());
      expect(result.requests).toBe(7);
    });

    it('returns defaults on error', async () => {
      mocks.mockStorageGet.mockRejectedValue(new Error('storage fail'));
      const { restoreMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      const result = await restoreMetrics(makeStorage());
      expect(result).toEqual(defaultMetrics);
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });
  });

  // ── persistMetrics ──────────────────────────────────────────────────────────

  describe('persistMetrics', () => {
    it('persists compressed metrics and sets lastUpdated', async () => {
      mocks.mockCompressData.mockResolvedValue('compressed-data');
      const metrics = { requests: 5, totalLatencyMs: 10, errors: 0, queueLength: 0, strategiesLoaded: 1, lastUpdated: 0 };
      const { persistMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      await persistMetrics(makeStorage(), metrics);
      expect(metrics.lastUpdated).toBeGreaterThan(0);
      expect(mocks.mockCompressData).toHaveBeenCalled();
      expect(mocks.mockStoragePut).toHaveBeenCalledWith('metrics', {
        data: 'compressed-data',
        compressed: true,
      });
    });

    it('falls back to uncompressed on compression error', async () => {
      mocks.mockCompressData.mockRejectedValue(new Error('compress fail'));
      const metrics = { requests: 1, totalLatencyMs: 0, errors: 0, queueLength: 0, strategiesLoaded: 0, lastUpdated: 0 };
      const { persistMetrics } = await import('../../../src/durable-objects/strategy-shard-state');
      await persistMetrics(makeStorage(), metrics);
      expect(mocks.mockStoragePut).toHaveBeenCalledWith('metrics', metrics);
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });
  });

  // ── persistHealth ───────────────────────────────────────────────────────────

  describe('persistHealth', () => {
    it('writes health to redis when available', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      const { persistHealth: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      const health = { status: 'healthy', rps: 100 };
      await freshFn(4, health);
      expect(mocks.mockHset).toHaveBeenCalledWith('shard:health', '4', JSON.stringify(health));
    });

    it('skips when redis is unavailable', async () => {
      (realGetRedisClient as any).mockReturnValue(null);
      const { persistHealth: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      await freshFn(4, { status: 'healthy' });
      expect(mocks.mockHset).not.toHaveBeenCalled();
    });
  });

  // ── initializeShard ─────────────────────────────────────────────────────────

  describe('initializeShard', () => {
    beforeEach(() => {
      mocks.mockSmembers.mockResolvedValue([]);
      mocks.mockStorageGet.mockResolvedValue(undefined);
    });

    it('loads strategies and registers health when env provided', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockLoadStrategy.mockResolvedValue({ id: 's1', name: 'test' });
      mocks.mockSmembers.mockResolvedValue(['s1']);
      const strategies = new Map<string, any>();
      const env = { SHARD_MANAGER: { updateShardHealth: mocks.mockUpdateShardHealth } } as any;
      const { initializeShard: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      await freshFn(2, makeStorage(), env, strategies);
      expect(strategies.size).toBe(1);
      expect(strategies.has('s1')).toBe(true);
      expect(mocks.mockUpdateShardHealth).toHaveBeenCalled();
    });

    it('skips health registration when env is undefined', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockSmembers.mockResolvedValue([]);
      const strategies = new Map<string, any>();
      const { initializeShard: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      await freshFn(2, makeStorage(), undefined, strategies);
      expect(mocks.mockUpdateShardHealth).not.toHaveBeenCalled();
    });

    it('logs and continues when a single strategy fails to load', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockSmembers.mockResolvedValue(['good', 'bad']);
      mocks.mockLoadStrategy
        .mockResolvedValueOnce({ id: 'good' })
        .mockRejectedValueOnce(new Error('load fail'));
      const strategies = new Map<string, any>();
      const { initializeShard: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      await freshFn(7, makeStorage(), undefined, strategies);
      expect(strategies.size).toBe(1);
      expect(strategies.has('good')).toBe(true);
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });

    it('re-throws when getStrategyAssignments fails', async () => {
      (realGetRedisClient as any).mockReturnValue(mocks.mockRedisClient);
      mocks.mockSmembers.mockRejectedValue(new Error('redis down'));
      const strategies = new Map<string, any>();
      const { initializeShard: freshFn } = await import('../../../src/durable-objects/strategy-shard-state');
      await expect(freshFn(1, makeStorage(), undefined, strategies)).rejects.toThrow();
      expect(mocks.mockLogger.error).toHaveBeenCalled();
    });
  });
});
