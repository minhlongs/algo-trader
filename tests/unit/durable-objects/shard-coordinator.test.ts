import type { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShardCoordinator } from '../../../src/durable-objects/shard-coordinator';
import type { ShardTopology } from '../../../src/durable-objects/shard-coordinator-types';

function createMockState(initialStorage?: Record<string, unknown>): {
  state: DurableObjectState;
  storageMap: Map<string, unknown>;
  blockConcurrencyCalled: boolean;
} {
  const storageMap = new Map<string, unknown>(Object.entries(initialStorage ?? {}));
  let blockConcurrencyCalled = false;

  const mockStorage: Partial<DurableObjectStorage> = {
    get: vi.fn().mockImplementation(async <T>(key: string) => (storageMap.get(key) as T) ?? null),
    put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      storageMap.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      return storageMap.delete(key);
    }),
  };

  const state = {
    storage: mockStorage as DurableObjectStorage,
    blockConcurrencyWhile: vi.fn().mockImplementation(async (callback: () => Promise<void>) => {
      blockConcurrencyCalled = true;
      await callback();
    }),
  } as unknown as DurableObjectState;

  return { state, storageMap, blockConcurrencyCalled };
}

describe('ShardCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes blockConcurrencyWhile and initializes topology', async () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, { totalShards: 12 });

    expect(state.blockConcurrencyWhile).toHaveBeenCalledTimes(1);
    const topo = coordinator.getTopology();
    expect(topo.shards).toHaveLength(12);
    expect(topo.regions).toContain('us-east');
    expect(topo.shards[0].status).toBe('HEALTHY');
  });

  it('restores existing topology from storage if available', async () => {
    const existingTopology: ShardTopology = {
      version: 5,
      regions: ['eu-west'],
      shards: [
        {
          shardId: 0,
          region: 'eu-west',
          endpoint: 'shard-0.eu',
          status: 'HEALTHY',
          weight: 1,
          lastHeartbeat: Date.now(),
          strategyCount: 3,
        },
      ],
      updatedAt: 123456789,
    };

    const { state } = createMockState({ topology: existingTopology });
    const coordinator = new ShardCoordinator(state, { totalShards: 1 });
    await coordinator.initializeState();

    const topo = coordinator.getTopology();
    expect(topo.version).toBe(5);
    expect(topo.shards).toHaveLength(1);
  });

  it('deterministically routes strategies and fails over when candidate shard is unhealthy', async () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, { totalShards: 12 });

    const shardA = coordinator.routeStrategy('alpha-trend-strategy-1');
    const shardA2 = coordinator.routeStrategy('alpha-trend-strategy-1');
    expect(shardA).toBe(shardA2);

    const topo = coordinator.getTopology();
    const targetNode = topo.shards.find((s) => s.shardId === shardA);
    expect(targetNode).toBeDefined();
    if (targetNode) {
      targetNode.status = 'UNHEALTHY';
    }

    const failoverShard = coordinator.routeStrategy('alpha-trend-strategy-1');
    expect(failoverShard).not.toBe(shardA);
    const failoverNode = topo.shards.find((s) => s.shardId === failoverShard);
    expect(failoverNode?.status).toBe('HEALTHY');
  });

  it('updates shard status based on heartbeat elapsed time', () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, {
      totalShards: 4,
      heartbeatTimeoutMs: 100,
    });

    const topo = coordinator.getTopology();
    topo.shards[0].lastHeartbeat = Date.now() - 150; // degraded
    topo.shards[1].lastHeartbeat = Date.now() - 300; // unhealthy

    const checked = coordinator.checkHealth();
    expect(checked.find((s) => s.shardId === 0)?.status).toBe('DEGRADED');
    expect(checked.find((s) => s.shardId === 1)?.status).toBe('UNHEALTHY');
    expect(checked.find((s) => s.shardId === 2)?.status).toBe('HEALTHY');

    coordinator.heartbeat(1, 5);
    expect(coordinator.getTopology().shards.find((s) => s.shardId === 1)?.status).toBe('HEALTHY');
    expect(coordinator.getTopology().shards.find((s) => s.shardId === 1)?.strategyCount).toBe(5);
  });

  it('handles distributed lock acquire, conflict, expiration, and release', async () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, { lockTtlMs: 200 });

    const acq1 = await coordinator.acquireLock('order-book-btc', 1);
    expect(acq1.acquired).toBe(true);
    expect(acq1.lock?.ownerShardId).toBe(1);

    const acq2 = await coordinator.acquireLock('order-book-btc', 2);
    expect(acq2.acquired).toBe(false);
    expect(acq2.error).toContain('locked by shard 1');

    const wrongRelease = await coordinator.releaseLock('order-book-btc', 2);
    expect(wrongRelease).toBe(false);

    const validRelease = await coordinator.releaseLock('order-book-btc', 1);
    expect(validRelease).toBe(true);

    const acq3 = await coordinator.acquireLock('order-book-btc', 2);
    expect(acq3.acquired).toBe(true);

    const quickLock = await coordinator.acquireLock('quick-res', 3, 50);
    expect(quickLock.acquired).toBe(true);

    await new Promise((r) => setTimeout(r, 60));

    const acqAfterExpiry = await coordinator.acquireLock('quick-res', 4);
    expect(acqAfterExpiry.acquired).toBe(true);
  });

  it('generates rebalance plan migrating strategies away from unhealthy shards', () => {
    const { state } = createMockState();
    const coordinator = new ShardCoordinator(state, {
      totalShards: 4,
      heartbeatTimeoutMs: 50,
    });

    const topo = coordinator.getTopology();
    topo.shards[2].lastHeartbeat = Date.now() - 200; // Unhealthy

    const assignments = new Map<number, string[]>([
      [0, ['strat-1']],
      [2, ['strat-unhealthy-1', 'strat-unhealthy-2']],
    ]);

    const plan = coordinator.generateRebalancePlan(assignments);
    expect(plan.moves).toHaveLength(2);
    expect(plan.moves[0].strategyId).toBe('strat-unhealthy-1');
    expect(plan.moves[0].fromShardId).toBe(2);
    expect(plan.moves[0].toShardId).not.toBe(2);
    expect(plan.moves[1].strategyId).toBe('strat-unhealthy-2');
    expect(plan.targetVersion).toBe(2);
  });
});
