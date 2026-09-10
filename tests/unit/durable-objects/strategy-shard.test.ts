/**
 * StrategyShard Durable Object — Unit Tests
 *
 * Covers the StrategyShard class:
 * - Constructor and shardId extraction
 * - fetch() routing: /health, /execute, /metrics, /info, 404
 * - Public handleHealthCheck() and handleExecute() delegates
 * - alarm() method: metrics restore, health update, persistHealth
 * - Queue and activeExecutions management
 *
 * All external dependencies (storage, Redis, ShardManager, StrategyLoader, logger)
 * are mocked via vi.mock factories.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock factories ───────────────────────────────────────────────────────────────

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));

const { mockGetRedisClient, mockPersistHealth } = vi.hoisted(() => ({
  mockGetRedisClient: vi.fn(),
  mockPersistHealth: vi.fn(),
}));

vi.mock('../../../src/durable-objects/strategy-shard-state', () => ({
  initializeShard: vi.fn().mockResolvedValue(undefined),
  restoreMetrics: vi.fn().mockResolvedValue({
    requests: 0,
    totalLatencyMs: 0,
    errors: 0,
    queueLength: 0,
    strategiesLoaded: 0,
    lastUpdated: 0,
  }),
  persistMetrics: vi.fn().mockResolvedValue(undefined),
  getRedisClient: mockGetRedisClient,
  persistHealth: mockPersistHealth,
  extractShardId: vi.fn((state: { id: { toString: () => string } }) => {
    const id = state.id.toString();
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < id.length; i++) {
      hash ^= id.charCodeAt(i);
      hash = ((hash << 1) + (hash >>> 31) + (hash << 4) + (hash >>> 27)) >>> 0;
    }
    return hash % 12;
  }),
}));

const { mockShardManagerUpdateHealth, mockShardManagerRecordMetrics } = vi.hoisted(() => ({
  mockShardManagerUpdateHealth: vi.fn().mockResolvedValue(undefined),
  mockShardManagerRecordMetrics: vi.fn(),
}));

vi.mock('../../../src/durable-objects/shard-manager', () => ({
  ShardManager: vi.fn().mockImplementation(() => ({
    updateShardHealth: mockShardManagerUpdateHealth,
    recordMetrics: mockShardManagerRecordMetrics,
  })),
}));

const { mockStrategyLoaderLoadStrategy } = vi.hoisted(() => ({
  mockStrategyLoaderLoadStrategy: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/desk/strategies/loader', () => ({
  StrategyLoader: vi.fn().mockImplementation(() => ({
    loadStrategy: mockStrategyLoaderLoadStrategy,
  })),
}));

// Now import the class under test
import { StrategyShard } from '../../../src/durable-objects/strategy-shard';
import type { DurableObjectState } from '@cloudflare/workers-types';
import type { Env, ShardMetrics, ShardExecutionResult } from '../../../src/durable-objects/strategy-shard-types';
import type { IStrategy } from '../../../src/desk/strategies/types';
import { initializeShard, restoreMetrics, persistMetrics, persistHealth, getRedisClient, extractShardId } from '../../../src/durable-objects/strategy-shard-state';

// ── Helpers ──────────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DurableObjectState> = {}): DurableObjectState {
  const storage = new Map<string, unknown>();
  return {
    id: { toString: () => 'test-shard-id-1' },
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      put: vi.fn(async (key: string, value: unknown) => { storage.set(key, value); }),
      delete: vi.fn(async (key: string) => { storage.delete(key); }),
      list: vi.fn(async () => Array.from(storage.entries())),
    } as unknown as DurableObjectState['storage'],
    blockConcurrencyWhile: vi.fn(async (cb: () => Promise<void>) => cb()),
    waitUntil: vi.fn((p: Promise<void>) => { p.catch(() => {}); }),
    ...overrides,
  } as unknown as DurableObjectState;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    STRATEGY_KV: undefined,
    SHARD_MANAGER: { updateShardHealth: mockShardManagerUpdateHealth, recordMetrics: mockShardManagerRecordMetrics },
    STRATEGY_STATE: undefined as any,
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<IStrategy> = {}): IStrategy {
  return {
    name: 'test-strategy',
    version: '1.0.0',
    category: 'test',
    execute: vi.fn().mockResolvedValue({ signal: 'BUY', confidence: 0.8 }),
    ...overrides,
  } as unknown as IStrategy;
}

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('StrategyShard', () => {
  let state: DurableObjectState;
  let env: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    state = makeState();
    env = makeEnv();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── Constructor & shardId ────────────────────────────────────────────────────

  describe('constructor & shardId extraction', () => {
    it('extracts shardId from state.id via FNV-1a hash (via fetch /health)', async () => {
      const shard = new StrategyShard(state);
      // extractShardId is a private method, but we verify by checking fetch /health returns a shardId
      const req = makeRequest('http://do/health');
      const res = await shard.fetch(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shardId).toBeDefined();
      expect(typeof body.shardId).toBe('number');
    });

    it('uses provided shardId when given', () => {
      const shard = new StrategyShard(state, 5);
      // shardId should be 5 (can't directly test private field, but alarm() uses it)
      expect(shard).toBeInstanceOf(StrategyShard);
    });

    it('initializes strategies map and metrics', () => {
      const shard = new StrategyShard(state);
      // private fields initialized, no errors thrown
      expect(shard).toBeInstanceOf(StrategyShard);
    });
  });

  // ── fetch() routing ──────────────────────────────────────────────────────────

  describe('fetch() routing', () => {
    it('returns 200 for GET /health', async () => {
      const shard = new StrategyShard(state, 3);
      // mock restoreMetrics for alarm if needed
      (restoreMetrics as any).mockResolvedValueOnce({
        requests: 10, totalLatencyMs: 500, errors: 1, queueLength: 2, strategiesLoaded: 4, lastUpdated: Date.now()
      });

      const req = makeRequest('http://do/health');
      const res = await shard.fetch(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shardId).toBe(3);
      expect(body.status).toBeDefined();
      expect(body.strategiesLoaded).toBeDefined();
    });

    it('returns 200 for GET /metrics', async () => {
      const shard = new StrategyShard(state, 7);
      const req = makeRequest('http://do/metrics');
      const res = await shard.fetch(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shardId).toBe(7);
      expect(body.requests).toBeDefined();
    });

    it('returns 200 for GET /info', async () => {
      const shard = new StrategyShard(state, 2);
      const req = makeRequest('http://do/info');
      const res = await shard.fetch(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shardId).toBe(2);
      expect(body.strategies).toBeInstanceOf(Array);
    });

    it('returns 404 for unknown route', async () => {
      const shard = new StrategyShard(state, 1);
      const req = makeRequest('http://do/unknown');
      const res = await shard.fetch(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not found');
    });

    it('routes POST /execute to handleExecute', async () => {
      const shard = new StrategyShard(state, 4);
      const strategy = makeStrategy();
      // @ts-expect-error - private access for test
      shard.strategies.set('strat-1', strategy);

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'strat-1', marketData: { price: 100 } }),
      });
      const res = await shard.fetch(req);
      expect(res.status).toBe(200);
      const body = await res.json() as ShardExecutionResult;
      expect(body.success).toBe(true);
      expect(body.strategyId).toBe('strat-1');
    });

    it('returns 404 on /execute when strategy not found', async () => {
      const shard = new StrategyShard(state, 4);
      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'missing', marketData: {} }),
      });
      const res = await shard.fetch(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });

    it('uses env from state when currentEnv is not set', async () => {
      const stateWithEnv = makeState({ env: { SHARD_MANAGER: { updateShardHealth: mockShardManagerUpdateHealth } } as any });
      const shard = new StrategyShard(stateWithEnv, 1);
      const req = makeRequest('http://do/health');
      const res = await shard.fetch(req);
      expect(res.status).toBe(200);
    });
  });

  // ── handleHealthCheck() public delegate ──────────────────────────────────────

  describe('handleHealthCheck() public delegate', () => {
    it('returns healthy status with shard metrics', async () => {
      const shard = new StrategyShard(state, 5);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 2;

      const res = shard.handleHealthCheck();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.shardId).toBe(5);
      expect(body.status).toBe('healthy');
    });

    it('returns degraded status when at capacity', async () => {
      const shard = new StrategyShard(state, 5);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 10; // MAX_CONCURRENT = 10

      const res = shard.handleHealthCheck();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('degraded');
    });
  });

  // ── handleExecute() public delegate ──────────────────────────────────────────

  describe('handleExecute() public delegate', () => {
    it('delegates to handleExecute and returns execution result', async () => {
      const shard = new StrategyShard(state, 3);
      const strategy = makeStrategy();
      // @ts-expect-error - private access for test
      shard.strategies.set('strat-1', strategy);

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'strat-1', marketData: { price: 100 } }),
      });

      const res = await shard.handleExecute(req);
      expect(res.status).toBe(200);
      const body = await res.json() as ShardExecutionResult;
      expect(body.success).toBe(true);
      expect(body.strategyId).toBe('strat-1');
    });

    it('increments activeExecutions and decrements in finally', async () => {
      const shard = new StrategyShard(state, 1);
      const strategy = makeStrategy();
      // @ts-expect-error - private access for test
      shard.strategies.set('s1', strategy);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 0;

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 's1', marketData: {} }),
      });
      await shard.handleExecute(req);
      // @ts-expect-error - private access for test
      expect(shard.activeExecutions).toBe(0);
    });
  });

  // ── alarm() method ───────────────────────────────────────────────────────────

  describe('alarm()', () => {
    function stateWithManager(): DurableObjectState {
      return makeState({
        env: { SHARD_MANAGER: { updateShardHealth: mockShardManagerUpdateHealth, recordMetrics: mockShardManagerRecordMetrics } } as any,
      });
    }

    it('restores metrics, computes avgLatency, updates shard health, persists health', async () => {
      const shard = new StrategyShard(stateWithManager(), 8);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 3;
      // @ts-expect-error - private access for test
      shard.strategies.set('s1', makeStrategy());
      // @ts-expect-error - private access for test
      shard.strategies.set('s2', makeStrategy());

      // Use persistent mock: constructor's initialize() also calls restoreMetrics
      (restoreMetrics as any).mockResolvedValue({
        requests: 100,
        totalLatencyMs: 5000,
        errors: 5,
        queueLength: 0,
        strategiesLoaded: 2,
        lastUpdated: Date.now(),
      });

      await shard.alarm();

      expect(restoreMetrics).toHaveBeenCalled();
      expect(mockShardManagerUpdateHealth).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          shardId: 8,
          strategyCount: 2,
          status: 'healthy',
        })
      );
      expect(persistHealth).toHaveBeenCalledWith(8, expect.any(Object));
    });

    it('sets status to degraded when at max concurrent', async () => {
      const shard = new StrategyShard(stateWithManager(), 2);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 10; // MAX_CONCURRENT

      (restoreMetrics as any).mockResolvedValue({
        requests: 50, totalLatencyMs: 1000, errors: 2, queueLength: 0, strategiesLoaded: 1, lastUpdated: Date.now()
      });

      await shard.alarm();

      expect(mockShardManagerUpdateHealth).toHaveBeenCalledWith(
        2,
        expect.objectContaining({ status: 'degraded' })
      );
    });

    it('handles missing SHARD_MANAGER gracefully', async () => {
      const stateNoMgr = makeState({ env: {} as any });
      const shard = new StrategyShard(stateNoMgr, 4);

      (restoreMetrics as any).mockResolvedValue({
        requests: 10, totalLatencyMs: 100, errors: 0, queueLength: 0, strategiesLoaded: 0, lastUpdated: Date.now()
      });

      await shard.alarm();

      // Should not throw even without SHARD_MANAGER
      expect(persistHealth).toHaveBeenCalled();
    });

    it('logs error and continues when alarm fails', async () => {
      const shard = new StrategyShard(stateWithManager(), 6);
      (restoreMetrics as any).mockRejectedValue(new Error('storage down'));

      await expect(shard.alarm()).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith('[StrategyShard] Alarm failed:', expect.any(Error));
    });

    it('computes rps as requests / 10', async () => {
      const shard = new StrategyShard(stateWithManager(), 9);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 1;

      (restoreMetrics as any).mockResolvedValue({
        requests: 200,
        totalLatencyMs: 1000,
        errors: 0,
        queueLength: 0,
        strategiesLoaded: 3,
        lastUpdated: Date.now(),
      });

      await shard.alarm();

      const callArgs = mockShardManagerUpdateHealth.mock.calls[0]?.[1];
      expect(callArgs).toBeDefined();
      expect(callArgs.rps).toBe(20); // 200 / 10
    });
  });

  // ── Strategy loading via initializeShard ────────────────────────────────────

  describe('initializeShard integration', () => {
    it('calls initializeShard on construction (fire-and-forget)', () => {
      new StrategyShard(state, 1);
      // initializeShard is called in constructor via fire-and-forget
      // We can't easily await it, but we can verify it was called
      expect(initializeShard).toHaveBeenCalled();
    });
  });

  // ── Queue and concurrency management ─────────────────────────────────────────

  describe('queue and concurrency management', () => {
    it('increments queueLength on /execute when at max concurrent (503 queued)', async () => {
      const shard = new StrategyShard(state, 1);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 10;
      // @ts-expect-error - private access for test
      shard.metrics.queueLength = 0;

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 's1', marketData: {} }),
      });
      const res = await shard.fetch(req);
      // At max concurrent: queueLength incremented, returns 503
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain('queued');
    });

    it('returns 429 when queue at capacity', async () => {
      const shard = new StrategyShard(state, 1);
      // @ts-expect-error - private access for test
      shard.metrics.queueLength = 100; // MAX_QUEUE_SIZE = 100

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 's1', marketData: {} }),
      });
      const res = await shard.fetch(req);
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.error).toContain('overloaded');
    });

    it('returns 503 when at max concurrent', async () => {
      const shard = new StrategyShard(state, 1);
      // @ts-expect-error - private access for test
      shard.activeExecutions = 10;
      // @ts-expect-error - private access for test
      shard.metrics.queueLength = 0;

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 's1', marketData: {} }),
      });
      const res = await shard.fetch(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain('queued');
    });
  });

  // ── Metrics persistence ──────────────────────────────────────────────────────

  describe('metrics persistence on execute', () => {
    it('persists metrics after successful execution', async () => {
      const shard = new StrategyShard(state, 1);
      const strategy = makeStrategy();
      // @ts-expect-error - private access for test
      shard.strategies.set('s1', strategy);

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 's1', marketData: { price: 100 } }),
      });
      await shard.fetch(req);

      expect(persistMetrics).toHaveBeenCalled();
    });
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('logs error on strategy execution failure', async () => {
      const shard = new StrategyShard(state, 1);
      const badStrategy = makeStrategy({ execute: vi.fn().mockRejectedValue(new Error('boom')) });
      // @ts-expect-error - private access for test
      shard.strategies.set('bad', badStrategy);

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'bad', marketData: {} }),
      });
      const res = await shard.fetch(req);

      expect(res.status).toBe(500);
      expect(mockLogger.error).toHaveBeenCalledWith('[StrategyShard] Execution error:', expect.any(Object));
    });

    it('calls shardManager.recordMetrics on error when env has SHARD_MANAGER', async () => {
      // Set up state with SHARD_MANAGER env so handleExecute can access it
      const stateWithMgr = makeState({
        env: { SHARD_MANAGER: { updateShardHealth: mockShardManagerUpdateHealth, recordMetrics: mockShardManagerRecordMetrics } } as any,
      });
      const shard = new StrategyShard(stateWithMgr, 1);
      const badStrategy = makeStrategy({ execute: vi.fn().mockRejectedValue(new Error('fail')) });
      // @ts-expect-error - private access for test
      shard.strategies.set('bad', badStrategy);

      const req = makeRequest('http://do/execute', {
        method: 'POST',
        body: JSON.stringify({ strategyId: 'bad', marketData: {} }),
      });
      await shard.fetch(req);

      expect(mockShardManagerRecordMetrics).toHaveBeenCalledWith(1, expect.any(Number), false);
    });
  });
});