import { vi } from 'vitest';
import type { ShardHealth, ShardMetrics, RingStateResponse } from '../shard-manager-types';
import type { HandlerContext, HandlerCallbacks } from '../shard-manager-handlers';

export function makeHealth(shardId: number): ShardHealth {
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

export function makeMetrics(): ShardMetrics {
  return { requests: 100, errors: 2, totalLatencyMs: 4000, lastUpdated: 1234 };
}

export function makeRingState(): RingStateResponse {
  return {
    totalShards: 12,
    virtualNodesPerShard: 100,
    distribution: new Map([[1, 10], [2, 20]]),
    balanced: true,
  };
}

export function makeCtx(
  health: Map<number, ShardHealth> = new Map(),
  metrics: Map<number, ShardMetrics> = new Map(),
): HandlerContext {
  return { storage: {}, shardHealth: health, shardMetrics: metrics };
}

export function makeRequest(path: string, method = 'GET', auth?: string): Request {
  const headers = new Headers();
  if (auth) headers.set('Authorization', auth);
  return new Request(`https://shard-mgr.example${path}`, { method, headers });
}

export function makeDefaultCallbacks(overrides: Partial<HandlerCallbacks> = {}): HandlerCallbacks {
  return {
    getRingState: () => makeRingState(),
    rebalance: vi.fn(async () => ({ previous: new Map(), updated: new Map() })),
    updateShardHealth: vi.fn(),
    ...overrides,
  };
}
