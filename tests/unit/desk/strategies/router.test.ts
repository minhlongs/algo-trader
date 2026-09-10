/**
 * StrategyRouter Tests
 * Covers shard assignment, cache, DO routing, health, and distribution
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetRedisClient, mockHashString, mockRecordShardLatency, mockLogger } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
  mockHashString: vi.fn(),
  mockRecordShardLatency: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../src/redis', () => ({ getRedisClient: mockGetRedisClient }));
vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));
vi.mock('../../../../src/shared/utils/consistent-hash', () => ({ hashString: mockHashString }));
vi.mock('../../../../src/middleware/prometheus-metrics', () => ({ recordShardLatency: mockRecordShardLatency }));

import {
  getShardId,
  getShardBindingName,
  invalidateShardCache,
  pruneShardCache,
  StrategyRouter,
  getStrategyRouter,
} from '../../../../src/desk/strategies/router';

function makeStub(ok = true, body: unknown = { signal: 'BUY', confidence: 0.8 }) {
  return {
    fetch: vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    }),
  };
}

describe('StrategyRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHashString.mockReturnValue(42);
    mockGetRedisClient.mockReturnValue({ get: vi.fn() });
    invalidateShardCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Pure functions ──────────────────────────────────────────────────────

  describe('getShardBindingName', () => {
    it('returns correct binding name', () => {
      expect(getShardBindingName(0)).toBe('SHARD_0');
      expect(getShardBindingName(11)).toBe('SHARD_11');
    });
  });

  describe('getShardId', () => {
    it('computes shard from hash modulo 12', () => {
      mockHashString.mockReturnValue(7);
      expect(getShardId('strat-1')).toBe(7);
    });

    it('caches result and returns cached value on second call', () => {
      mockHashString.mockReturnValue(5);
      const first = getShardId('strat-a');
      mockHashString.mockReturnValue(99); // should not be used
      const second = getShardId('strat-a');
      expect(first).toBe(5);
      expect(second).toBe(5);
      expect(mockHashString).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache after invalidateShardCache', () => {
      mockHashString.mockReturnValue(3);
      getShardId('strat-x');
      invalidateShardCache();
      vi.clearAllMocks();
      mockHashString.mockReturnValue(8);
      expect(getShardId('strat-x')).toBe(8);
      expect(mockHashString).toHaveBeenCalledTimes(1);
    });

    it('prunes expired cache entries', () => {
      vi.useFakeTimers();
      mockHashString.mockReturnValue(2);
      getShardId('old-strat');
      vi.advanceTimersByTime(61_000); // past TTL
      mockHashString.mockReturnValue(6);
      pruneShardCache();
      expect(getShardId('old-strat')).toBe(6); // recomputed
    });

    it('keeps valid cache entries after prune', () => {
      vi.useFakeTimers();
      mockHashString.mockReturnValue(4);
      getShardId('fresh-strat');
      vi.advanceTimersByTime(30_000); // within TTL
      pruneShardCache();
      mockHashString.mockReturnValue(99);
      expect(getShardId('fresh-strat')).toBe(4); // still cached
    });
  });

  describe('invalidateShardCache', () => {
    it('clears both maps', () => {
      mockHashString.mockReturnValue(1);
      getShardId('s1');
      getShardId('s2');
      invalidateShardCache();
      vi.clearAllMocks();
      mockHashString.mockReturnValue(0);
      getShardId('s1');
      expect(mockHashString).toHaveBeenCalledTimes(1);
    });
  });

  // ── executeStrategy ─────────────────────────────────────────────────────

  describe('executeStrategy', () => {
    it('routes to correct shard and returns signal', async () => {
      const stub = makeStub(true, { signal: 'SELL', confidence: 0.9 });
      mockHashString.mockReturnValue(3);
      const router = new StrategyRouter({ SHARD_3: stub as unknown } as Record<string, unknown>);

      const result = await router.executeStrategy('strat-1', { price: 100 });

      expect(result.success).toBe(true);
      expect(result.signal).toBe('SELL');
      expect(result.confidence).toBe(0.9);
      expect(result.shardId).toBe(3);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(stub.fetch).toHaveBeenCalledOnce();
      expect(mockRecordShardLatency).toHaveBeenCalledWith('3', 'execute', expect.any(Number));
    });

    it('returns error when no env binding', async () => {
      mockHashString.mockReturnValue(0);
      const router = new StrategyRouter();
      const result = await router.executeStrategy('strat-1', { price: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Shard DO binding not found');
    });

    it('returns error when binding not in env', async () => {
      mockHashString.mockReturnValue(5);
      const router = new StrategyRouter({});
      const result = await router.executeStrategy('strat-1', { price: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Shard DO binding not found');
    });

    it('handles non-ok HTTP response', async () => {
      const stub = makeStub(false, { error: 'Shard overloaded' });
      mockHashString.mockReturnValue(1);
      const router = new StrategyRouter({ SHARD_1: stub as unknown } as Record<string, unknown>);

      const result = await router.executeStrategy('strat-1', { price: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Shard overloaded');
      expect(result.shardId).toBe(1);
    });

    it('handles non-ok response with unparseable body', async () => {
      const stub = {
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          json: () => Promise.reject(new Error('bad json')),
        }),
      };
      mockHashString.mockReturnValue(2);
      const router = new StrategyRouter({ SHARD_2: stub as unknown } as Record<string, unknown>);

      const result = await router.executeStrategy('strat-1', { price: 100 });
      expect(result.success).toBe(false);
      // .json().catch() falls back to { error: 'Unknown error' } which is truthy
      expect(result.error).toBe('Unknown error');
    });

    it('handles fetch throw (network error)', async () => {
      const stub = {
        fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      mockHashString.mockReturnValue(4);
      const router = new StrategyRouter({ SHARD_4: stub as unknown } as Record<string, unknown>);

      const result = await router.executeStrategy('strat-1', { price: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
      expect(result.signal).toBe('HOLD');
      expect(result.confidence).toBe(0);
      expect(mockRecordShardLatency).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('passes strategyId and marketData in fetch body', async () => {
      const stub = makeStub(true, { signal: 'HOLD', confidence: 0.5 });
      mockHashString.mockReturnValue(0);
      const router = new StrategyRouter({ SHARD_0: stub as unknown } as Record<string, unknown>);

      await router.executeStrategy('my-strat', { price: 42 }, { timeoutMs: 5000 });

      const [url, opts] = stub.fetch.mock.calls[0];
      expect(url).toContain('strategyId=my-strat');
      const body = JSON.parse(opts.body);
      expect(body.strategyId).toBe('my-strat');
      expect(body.marketData).toEqual({ price: 42 });
    });
  });

  // ── getShardHealth ──────────────────────────────────────────────────────

  describe('getShardHealth', () => {
    it('returns unbound for all shards when no env', async () => {
      const router = new StrategyRouter();
      const health = await router.getShardHealth();
      expect(health).toHaveLength(12);
      expect(health.every(h => h.status === 'unbound')).toBe(true);
    });

    it('returns status for bound healthy shards', async () => {
      const stub0 = { fetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'running', strategiesLoaded: 5 }) }) };
      const stub3 = { fetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'idle', strategiesLoaded: 0 }) }) };
      const env = { SHARD_0: stub0 as unknown, SHARD_3: stub3 as unknown } as Record<string, unknown>;
      const router = new StrategyRouter(env);

      const health = await router.getShardHealth();
      expect(health).toHaveLength(12);
      expect(health[0]!.status).toBe('running');
      expect(health[3]!.status).toBe('idle');
      expect(health[1]!.status).toBe('unbound');
    });

    it('handles unreachable shard (non-ok response)', async () => {
      const stub = { fetch: vi.fn().mockResolvedValue({ ok: false }) };
      const env = { SHARD_2: stub as unknown } as Record<string, unknown>;
      const router = new StrategyRouter(env);

      const health = await router.getShardHealth();
      expect(health[2]!.status).toBe('unreachable');
    });

    it('handles error during health fetch', async () => {
      const stub = { fetch: vi.fn().mockRejectedValue(new Error('timeout')) };
      const env = { SHARD_5: stub as unknown } as Record<string, unknown>;
      const router = new StrategyRouter(env);

      const health = await router.getShardHealth();
      expect(health[5]!.status).toBe('error');
    });
  });

  // ── static getShardId ───────────────────────────────────────────────────

  describe('static getShardId', () => {
    it('delegates to module-level getShardId', () => {
      mockHashString.mockReturnValue(11);
      expect(StrategyRouter.getShardId('test')).toBe(11);
    });
  });

  // ── getDistribution ─────────────────────────────────────────────────────

  describe('getDistribution', () => {
    it('initializes all 12 shards', async () => {
      const router = new StrategyRouter();
      const dist = await router.getDistribution([]);
      expect(dist.size).toBe(12);
      for (let i = 0; i < 12; i++) {
        expect(dist.get(i)).toBe(0);
      }
    });

    it('counts strategies per shard', async () => {
      mockHashString.mockImplementation((s: string) => s.charCodeAt(0) % 12);
      const router = new StrategyRouter();
      const dist = await router.getDistribution(['a', 'b', 'c']);
      const total = Array.from(dist.values()).reduce((a, b) => a + b, 0);
      expect(total).toBe(3);
    });
  });

  // ── getStrategyRouter singleton ─────────────────────────────────────────

  describe('getStrategyRouter', () => {
    it('returns a singleton instance', () => {
      const a = getStrategyRouter();
      const b = getStrategyRouter();
      expect(a).toBe(b);
    });
  });
});
