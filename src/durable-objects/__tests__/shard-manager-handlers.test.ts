/**
 * Tests for shard-manager-handlers — admin API routing, health/metrics
 * responses, and the timing-safe admin auth check.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ShardHealth, ShardMetrics, RingStateResponse } from '../shard-manager-types';

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));

vi.mock('../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError },
}));

import {
  isAdminAuth, handleHealthCheck, handleMetrics, handleAdminRequest,
  type HandlerContext, type HandlerCallbacks,
} from '../shard-manager-handlers';

function makeHealth(shardId: number): ShardHealth {
  return { shardId, lastHeartbeat: 1000, rps: 12.5, avgLatencyMs: 40, errorCount: 1, strategyCount: 5, status: 'healthy' };
}

function makeMetrics(): ShardMetrics {
  return { requests: 100, errors: 2, totalLatencyMs: 4000, lastUpdated: 1234 };
}

function makeRingState(): RingStateResponse {
  return { totalShards: 12, virtualNodesPerShard: 100, distribution: new Map([[1, 10], [2, 20]]), balanced: true };
}

function makeCtx(health: Map<number, ShardHealth>, metrics: Map<number, ShardMetrics>): HandlerContext {
  return { storage: {}, shardHealth: health, shardMetrics: metrics };
}

function makeCallbacks(overrides: Partial<HandlerCallbacks> = {}): HandlerCallbacks {
  return {
    getRingState: () => makeRingState(),
    rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })),
    updateShardHealth: vi.fn(),
    ...overrides,
  };
}

function makeRequest(path: string, method = 'GET', auth?: string): Request {
  const headers = new Headers();
  if (auth) headers.set('Authorization', auth);
  return new Request(`https://shard-mgr.example${path}`, { method, headers });
}

describe('isAdminAuth', () => {
  it('accepts the correct bearer token and rejects missing/wrong/different-length tokens', () => {
    const env = { ADMIN_API_KEY: 'secret-key' };
    expect(isAdminAuth(makeRequest('/admin/ring'), {})).toBe(false);
    expect(isAdminAuth(makeRequest('/admin/ring', 'GET', 'Bearer secret-key'), env)).toBe(true);
    expect(isAdminAuth(makeRequest('/admin/ring', 'GET', 'Bearer xecret-key'), env)).toBe(false);
    expect(isAdminAuth(makeRequest('/admin/ring', 'GET', 'Bearer short'), env)).toBe(false);
    expect(isAdminAuth(makeRequest('/admin/ring'), env)).toBe(false);
  });
});

describe('handleHealthCheck & handleMetrics', () => {
  it('returns ok status with ring state, shard health, and flattened metrics', async () => {
    const res = handleHealthCheck(makeRingState(), new Map([[1, makeHealth(1)]]));
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.ring.totalShards).toBe(12);
    expect(body.shardHealth['1'].shardId).toBe(1);
    expect(body.shardHealth['1'].status).toBe('healthy');

    const metricsRes = handleMetrics(new Map([[3, makeMetrics()]]));
    expect((await metricsRes.json())['3']).toEqual({ errorCount: 2, lastUpdated: 1234 });
  });
});

describe('handleAdminRequest', () => {
  it('returns 404 for unknown admin endpoints and ring state for GET /admin/ring', async () => {
    const res404 = await handleAdminRequest(makeRequest('/admin/nope'), makeCtx(new Map(), new Map()), makeCallbacks());
    expect(await res404.json()).toEqual({ error: 'Unknown admin endpoint' });

    const resRing = await handleAdminRequest(makeRequest('/admin/ring'), makeCtx(new Map(), new Map()), makeCallbacks());
    const body = await resRing.json();
    expect(body.totalShards).toBe(12);
    expect(body.balanced).toBe(true);
  });

  it('returns rebalance result for POST /admin/ring/rebalance', async () => {
    const rebalance = vi.fn(async () => ({ previous: new Map([[1, 10]]), updated: new Map([[1, 11]]) }));
    const res = await handleAdminRequest(
      makeRequest('/admin/ring/rebalance', 'POST'),
      makeCtx(new Map(), new Map()),
      makeCallbacks({ rebalance }),
    );
    const body = await res.json();
    expect(body.rebalanced).toBe(true);
    expect(body.previous['1']).toBe(10);
    expect(body.updated['1']).toBe(11);
    expect(rebalance).toHaveBeenCalledTimes(1);
  });

  it('handles shard health and metrics lookup and missing 404s', async () => {
    const resNoHealth = await handleAdminRequest(makeRequest('/admin/shard/99/health'), makeCtx(new Map(), new Map()), makeCallbacks());
    expect(await resNoHealth.json()).toEqual({ error: 'Shard not found' });

    const resHealth = await handleAdminRequest(makeRequest('/admin/shard/5/health'), makeCtx(new Map([[5, makeHealth(5)]]), new Map()), makeCallbacks());
    expect(await resHealth.json()).toMatchObject({ shardId: 5, status: 'healthy' });

    const resNoMetrics = await handleAdminRequest(makeRequest('/admin/shard/7/metrics'), makeCtx(new Map(), new Map()), makeCallbacks());
    expect(await resNoMetrics.json()).toEqual({ error: 'Metrics not found' });

    const resMetrics = await handleAdminRequest(makeRequest('/admin/shard/8/metrics'), makeCtx(new Map(), new Map([[8, makeMetrics()]])), makeCallbacks());
    expect(await resMetrics.json()).toMatchObject({ shardId: 8, errors: 2, lastUpdated: 1234 });
  });

  it('returns 500 and logs when a callback throws', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/ring/rebalance', 'POST'),
      makeCtx(new Map(), new Map()),
      makeCallbacks({ rebalance: vi.fn(async () => { throw new Error('boom'); }) }),
    );
    expect(await res.json()).toEqual({ error: 'Internal server error' });
    expect(loggerError).toHaveBeenCalledWith('[ShardManager] Admin request error:', expect.anything());
  });
});
