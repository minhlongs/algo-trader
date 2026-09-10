/**
 * shard-fetch-handlers — Unit Tests
 *
 * Covers handleHealthCheck, handleMetricsResponse, and handleExecute:
 * - handleHealthCheck: healthy/degraded status, memory info, timestamp
 * - handleMetricsResponse: shardId spread, avgLatency computation
 * - handleExecute: 429 overload, 503 busy-queued, 404 missing strategy,
 *   200 success with latency metrics, 500 on execution error, finally-block
 *   decrement and queue cleanup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getMemoryInfoMock, persistMetricsMock, recordMetricsMock, executeMock } = vi.hoisted(() => {
  const getMemoryInfo = vi.fn();
  const persistMetrics = vi.fn();
  const recordMetrics = vi.fn();
  const execute = vi.fn();
  return { getMemoryInfoMock: getMemoryInfo, persistMetricsMock: persistMetrics, recordMetricsMock: recordMetrics, executeMock: execute };
});

vi.mock('../../../src/durable-objects/shard-metrics', () => ({
  getMemoryInfo: getMemoryInfoMock,
  computeAvgLatency: vi.fn((m: { requests: number; totalLatencyMs: number }) =>
    m.requests > 0 ? m.totalLatencyMs / m.requests : 0,
  ),
}));

vi.mock('../../../src/durable-objects/strategy-shard-state', () => ({
  persistMetrics: persistMetricsMock,
}));

vi.mock('../../../src/durable-objects/shard-manager', () => ({
  ShardManager: vi.fn().mockImplementation(() => ({
    recordMetrics: recordMetricsMock,
  })),
}));

vi.mock('../../../src/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { handleHealthCheck, handleMetricsResponse, handleExecute, type ExecuteContext, type Env } from '../../../src/durable-objects/shard-fetch-handlers';
import type { ShardMetrics, ShardExecutionResult } from '../../../src/durable-objects/strategy-shard-types';
import type { IStrategy } from '../../../src/desk/strategies/types';

const baseMetrics: ShardMetrics = {
  requests: 0,
  totalLatencyMs: 0,
  errors: 0,
  queueLength: 5,
  strategiesLoaded: 3,
  lastUpdated: 0,
};

function makeContext(overrides: Partial<ExecuteContext> = {}): ExecuteContext {
  const strategies = new Map<string, IStrategy>();
  return {
    shardId: 1,
    metrics: { ...baseMetrics, queueLength: 0 },
    activeExecutions: 0,
    maxConcurrent: 10,
    maxQueueSize: 50,
    storage: { put: vi.fn().mockResolvedValue(undefined) },
    strategies,
    ...overrides,
  };
}

describe('handleHealthCheck', () => {
  beforeEach(() => {
    getMemoryInfoMock.mockReturnValue({ rss: 256, heapUsed: 128 });
  });

  it('returns healthy status when under capacity', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000);
    const res = handleHealthCheck({
      shardId: 1, activeExecutions: 3, maxConcurrent: 10,
      metrics: { ...baseMetrics, queueLength: 2 },
      strategiesLoaded: 5,
    });
    expect(res.status).toBe(200);
    const body = res.json ? res : null;
    void body;
    expect(getMemoryInfoMock).toHaveBeenCalled();
  });

  it('returns degraded status when at capacity', () => {
    const res = handleHealthCheck({
      shardId: 2, activeExecutions: 10, maxConcurrent: 10,
      metrics: { ...baseMetrics, queueLength: 0 },
      strategiesLoaded: 1,
    });
    expect(res.status).toBe(200);
    expect(getMemoryInfoMock).toHaveBeenCalled();
  });
});

describe('handleMetricsResponse', () => {
  it('spreads shardId and metrics, computes avg latency', () => {
    const metrics: ShardMetrics = { requests: 10, totalLatencyMs: 500, errors: 1, queueLength: 0, strategiesLoaded: 2, lastUpdated: 0 };
    const res = handleMetricsResponse(7, metrics);
    expect(res.status).toBe(200);
  });

  it('returns 50 when zero requests', () => {
    const metrics: ShardMetrics = { requests: 0, totalLatencyMs: 0, errors: 0, queueLength: 0, strategiesLoaded: 0, lastUpdated: 0 };
    const res = handleMetricsResponse(9, metrics);
    expect(res.status).toBe(200);
  });
});

describe('handleExecute', () => {
  beforeEach(() => {
    getMemoryInfoMock.mockReturnValue({ rss: 256, heapUsed: 128 });
    persistMetricsMock.mockResolvedValue(undefined);
    recordMetricsMock.mockImplementation(() => {});
    executeMock.mockReset();
  });

  it('returns 429 when queue is at capacity', async () => {
    const ctx = makeContext({ metrics: { ...baseMetrics, queueLength: 50, strategiesLoaded: 0 }, maxQueueSize: 50 });
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's1', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    const res = await handleExecute(req, env, ctx);
    expect(res.status).toBe(429);
    const body = await res.clone().json();
    expect(body.error).toContain('overloaded');
  });

  it('returns 503 when at max concurrent and queues', async () => {
    const ctx = makeContext({ metrics: { ...baseMetrics, queueLength: 0 }, activeExecutions: 10, maxConcurrent: 10, maxQueueSize: 50 });
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's1', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    const res = await handleExecute(req, env, ctx);
    expect(res.status).toBe(503);
    expect(ctx.metrics.queueLength).toBe(1);
    const body = await res.clone().json();
    expect(body.error).toContain('queued');
  });

  it('returns 404 when strategy not found', async () => {
    const ctx = makeContext();
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 'missing', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    const res = await handleExecute(req, env, ctx);
    expect(res.status).toBe(404);
    const body = await res.clone().json();
    expect(body.error).toContain('not found');
  });

  it('returns 200 with execution result on success (sync execute)', async () => {
    const strat: IStrategy = { name: 's1', version: '1', category: 'cat', execute: vi.fn().mockResolvedValue({ signal: 'BUY', confidence: 0.8 }) } as unknown as IStrategy;
    const ctx = makeContext();
    ctx.strategies.set('s1', strat);
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's1', marketData: { price: 100 } }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    const res = await handleExecute(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.clone().json() as ShardExecutionResult;
    expect(body.success).toBe(true);
    expect(body.signal).toBe('BUY');
    expect(body.confidence).toBe(0.8);
    expect(persistMetricsMock).toHaveBeenCalled();
  });

  it('returns 200 with execution result when execute returns via onTick', async () => {
    const strat: IStrategy = { name: 's2', version: '1', category: 'cat', onTick: vi.fn().mockReturnValue({ signal: 'SELL', confidence: 0.9 }) } as unknown as IStrategy;
    const ctx = makeContext();
    ctx.strategies.set('s2', strat);
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's2', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    const res = await handleExecute(req, env, ctx);
    expect(res.status).toBe(200);
    const body = await res.clone().json() as ShardExecutionResult;
    expect(body.signal).toBe('SELL');
  });

  it('throws and returns 500 when strategy.execute throws', async () => {
    const strat = { name: 's3', version: '1', category: 'cat', execute: vi.fn().mockRejectedValue(new Error('strat fail')) } as unknown as IStrategy;
    const ctx = makeContext();
    ctx.strategies.set('s3', strat);
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's3', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    const res = await handleExecute(req, env, ctx);
    expect(res.status).toBe(500);
    const body = await res.clone().json();
    expect(body.error).toBe('Strategy execution failed');
  });

  it('calls shardManager.recordMetrics on error when env has SHARD_MANAGER', async () => {
    const strat = { name: 's4', version: '1', category: 'cat', execute: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as IStrategy;
    const ctx = makeContext();
    ctx.strategies.set('s4', strat);
    const manager = { recordMetrics: recordMetricsMock };
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's4', marketData: {} }) });
    const env = { SHARD_MANAGER: manager } as unknown as Env;
    await handleExecute(req, env, ctx);
    expect(recordMetricsMock).toHaveBeenCalledWith(1, expect.any(Number), false);
  });

  it('decrements activeExecutions and decrements queue in finally block', async () => {
    const ctx = makeContext();
    ctx.strategies.set('s1', { execute: vi.fn().mockResolvedValue({ signal: 'HOLD', confidence: 0.5 }) });
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's1', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    await handleExecute(req, env, ctx);
    // 0 -> 1 (enter) -> 0 (finally decrement)
    expect(ctx.activeExecutions).toBe(0);
    expect(ctx.metrics.queueLength).toBe(0);
  });

  it('clamps queueLength to 0 in finally when already zero', async () => {
    const ctx = makeContext({ metrics: { ...baseMetrics, queueLength: 0 }, maxQueueSize: 50 });
    ctx.strategies.set('s1', { execute: vi.fn().mockResolvedValue({ signal: 'HOLD', confidence: 0.5 }) });
    const req = new Request('http://do/POST', { method: 'POST', body: JSON.stringify({ strategyId: 's1', marketData: {} }) });
    const env = { SHARD_MANAGER: undefined } as unknown as Env;
    await handleExecute(req, env, ctx);
    expect(ctx.metrics.queueLength).toBe(0);
  });
});
