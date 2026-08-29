/**
 * Tests for shard-manager-handlers — admin API routing, health/metrics
 * responses, and the timing-safe admin auth check.
 *
 * All functions are pure (Response.json/URL only), so no mocks are needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ShardHealth, ShardMetrics, RingStateResponse } from '../shard-manager-types';

const { loggerError } = vi.hoisted(() => ({ loggerError: vi.fn() }));

vi.mock('../../shared/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: loggerError },
}));

import {
  isAdminAuth,
  handleHealthCheck,
  handleMetrics,
  handleAdminRequest,
  type HandlerContext,
  type HandlerCallbacks,
} from '../shard-manager-handlers';

function makeHealth(shardId: number): ShardHealth {
  return {
    shardId,
    lastHeartbeat: 1000,
    rps: 12.5,
    avgLatencyMs: 40,
    errorCount: 1,
    strategyCount: 5,
    status: 'healthy',
  };
}

function makeMetrics(): ShardMetrics {
  return { requests: 100, errors: 2, totalLatencyMs: 4000, lastUpdated: 1234 };
}

function makeRingState(): RingStateResponse {
  return {
    totalShards: 12,
    virtualNodesPerShard: 100,
    distribution: new Map([[1, 10], [2, 20]]),
    balanced: true,
  };
}

function makeCtx(health: Map<number, ShardHealth>, metrics: Map<number, ShardMetrics>): HandlerContext {
  return { storage: {}, shardHealth: health, shardMetrics: metrics };
}

function makeRequest(path: string, method = 'GET', auth?: string): Request {
  const headers = new Headers();
  if (auth) headers.set('Authorization', auth);
  return new Request(`https://shard-mgr.example${path}`, { method, headers });
}

describe('isAdminAuth', () => {
  it('rejects when ADMIN_API_KEY is unset', () => {
    expect(isAdminAuth(makeRequest('/admin/ring'), {})).toBe(false);
  });

  it('accepts the correct bearer token', () => {
    const env = { ADMIN_API_KEY: 'secret-key' };
    expect(isAdminAuth(makeRequest('/admin/ring', 'GET', 'Bearer secret-key'), env)).toBe(true);
  });

  it('rejects a wrong token of the same length', () => {
    const env = { ADMIN_API_KEY: 'secret-key' };
    expect(isAdminAuth(makeRequest('/admin/ring', 'GET', 'Bearer xecret-key'), env)).toBe(false);
  });

  it('rejects a token of a different length', () => {
    const env = { ADMIN_API_KEY: 'secret-key' };
    expect(isAdminAuth(makeRequest('/admin/ring', 'GET', 'Bearer short'), env)).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    const env = { ADMIN_API_KEY: 'secret-key' };
    expect(isAdminAuth(makeRequest('/admin/ring'), env)).toBe(false);
  });
});

describe('handleHealthCheck', () => {
  it('returns ok status with ring state and shard health', async () => {
    const res = handleHealthCheck(makeRingState(), new Map([[1, makeHealth(1)]]));
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.ring.totalShards).toBe(12);
    expect(body.shardHealth['1'].shardId).toBe(1);
    expect(body.shardHealth['1'].status).toBe('healthy');
  });
});

describe('handleMetrics', () => {
  it('flattens the per-shard metrics map to errorCount/lastUpdated', async () => {
    const res = handleMetrics(new Map([[3, makeMetrics()]]));
    const body = await res.json();
    expect(body["3"]).toEqual({ errorCount: 2, lastUpdated: 1234 });
  });
});

describe('handleAdminRequest', () => {
  it('returns 404 for unknown admin endpoints', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/nope'),
      makeCtx(new Map(), new Map()),
      { getRingState: () => makeRingState(), rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })), updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body).toEqual({ error: 'Unknown admin endpoint' });
  });

  it('returns ring state for GET /admin/ring', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/ring'),
      makeCtx(new Map(), new Map()),
      { getRingState: () => makeRingState(), rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })), updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body.totalShards).toBe(12);
    expect(body.balanced).toBe(true);
  });

  it('returns rebalance result for POST /admin/ring/rebalance', async () => {
    const rebalance = vi.fn(async () => ({ previous: new Map([[1, 10]]), updated: new Map([[1, 11]]) }));
    const res = await handleAdminRequest(
      makeRequest('/admin/ring/rebalance', 'POST'),
      makeCtx(new Map(), new Map()),
      { getRingState: () => makeRingState(), rebalance, updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body.rebalanced).toBe(true);
    expect(body.previous['1']).toBe(10);
    expect(body.updated['1']).toBe(11);
    expect(rebalance).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for a shard health that does not exist', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/shard/99/health'),
      makeCtx(new Map(), new Map()),
      { getRingState: () => makeRingState(), rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })), updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body).toEqual({ error: 'Shard not found' });
  });

  it('returns shard health for an existing shard', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/shard/5/health'),
      makeCtx(new Map([[5, makeHealth(5)]]), new Map()),
      { getRingState: () => makeRingState(), rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })), updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body.shardId).toBe(5);
    expect(body.status).toBe('healthy');
  });

  it('returns 404 for a shard metrics that does not exist', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/shard/7/metrics'),
      makeCtx(new Map(), new Map()),
      { getRingState: () => makeRingState(), rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })), updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body).toEqual({ error: 'Metrics not found' });
  });

  it('returns shard metrics for an existing shard', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/shard/8/metrics'),
      makeCtx(new Map(), new Map([[8, makeMetrics()]])),
      { getRingState: () => makeRingState(), rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })), updateShardHealth: vi.fn() },
    );
    const body = await res.json();
    expect(body.shardId).toBe(8);
    expect(body.errors).toBe(2);
    expect(body.lastUpdated).toBe(1234);
  });

  it('returns 500 and logs when a callback throws', async () => {
    const res = await handleAdminRequest(
      makeRequest('/admin/ring/rebalance', 'POST'),
      makeCtx(new Map(), new Map()),
      {
        getRingState: () => makeRingState(),
        rebalance: vi.fn(async () => { throw new Error('boom'); }),
        updateShardHealth: vi.fn(),
      },
    );
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(loggerError).toHaveBeenCalledWith('[ShardManager] Admin request error:', expect.anything());
  });
});
