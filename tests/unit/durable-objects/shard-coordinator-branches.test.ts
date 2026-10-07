import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShardCoordinator } from '../../../src/durable-objects/shard-coordinator';

function createMockState(options?: {
  storageGetError?: Error;
  blockConcurrencyError?: Error;
}): {
  state: DurableObjectState;
} {
  const storageMap = new Map<string, unknown>();

  const mockStorage: Partial<DurableObjectStorage> = {
    get: vi.fn().mockImplementation(async <T>(key: string) => {
      if (options?.storageGetError) throw options.storageGetError;
      return (storageMap.get(key) as T) ?? null;
    }),
    put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      storageMap.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storageMap.delete(key)),
  };

  const state = {
    storage: mockStorage as DurableObjectStorage,
    blockConcurrencyWhile: vi.fn().mockImplementation(async (callback: () => Promise<void>) => {
      if (options?.blockConcurrencyError) throw options.blockConcurrencyError;
      await callback();
    }),
  } as unknown as DurableObjectState;

  return { state };
}

describe('ShardCoordinator Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles initialization failure catch branch safely', async () => {
    const { state } = createMockState({ storageGetError: new Error('Storage Engine Fault') });
    const coordinator = new ShardCoordinator(state, { totalShards: 2 });
    await coordinator.ready();
    expect(coordinator.getTopology().shards).toHaveLength(2);
  });

  it('handles blockConcurrencyWhile exception catch branch', () => {
    const { state } = createMockState({ blockConcurrencyError: new Error('Concurrency lock failed') });
    expect(() => new ShardCoordinator(state, { totalShards: 2 })).not.toThrow();
  });

  it('routes to candidate when all shards in the topology are unhealthy', () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, { totalShards: 4 });
    const topo = coordinator.getTopology();
    for (const s of topo.shards) {
      s.status = 'UNHEALTHY';
    }

    const candidate = coordinator.routeStrategy('any-strategy-key');
    expect(candidate).toBeGreaterThanOrEqual(0);
    expect(candidate).toBeLessThan(4);
  });

  it('safely handles heartbeat for non-existent shardId', () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, { totalShards: 2 });
    expect(() => coordinator.heartbeat(9999, 10)).not.toThrow();
  });

  it('allows same shard owner to re-acquire / refresh active lock', async () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state);

    const first = await coordinator.acquireLock('res-1', 1, 10000);
    expect(first.acquired).toBe(true);

    const second = await coordinator.acquireLock('res-1', 1, 10000);
    expect(second.acquired).toBe(true);
  });

  it('returns false when releasing nonexistent lock or releasing with wrong owner', async () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state);

    const nonexistent = await coordinator.releaseLock('missing-res', 1);
    expect(nonexistent).toBe(false);

    await coordinator.acquireLock('res-locked', 1);
    const wrongOwner = await coordinator.releaseLock('res-locked', 2);
    expect(wrongOwner).toBe(false);
  });

  it('returns empty moves in rebalance plan when no healthy shards exist', () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, { totalShards: 2 });
    const topo = coordinator.getTopology();
    for (const s of topo.shards) {
      s.status = 'UNHEALTHY';
    }

    const assignments = new Map([[0, ['strat-1']]]);
    const plan = coordinator.generateRebalancePlan(assignments);
    expect(plan.moves).toEqual([]);
  });
});
