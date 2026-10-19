/**
 * Shard Coordinator Durable Object
 * Manages consistent hash ring, multi-region routing, health tracking, and distributed locks.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import { buildRing, type HashRing } from '../desk/utils/consistent-hash';
import { logger } from '../shared/utils/logger';
import type {
  DistributedLock,
  LockAcquisitionResult,
  RebalancePlan,
  ShardCoordinatorConfig,
  ShardNode,
  ShardTopology,
} from './shard-coordinator-types';
import {
  computeRebalanceMoves,
  createInitialTopology,
  DEFAULT_REGIONS,
  evaluateShardHealth,
  routeStrategyToShard,
} from './shard-coordinator-helpers';

export {
  DEFAULT_REGIONS,
  createInitialTopology,
  routeStrategyToShard,
  evaluateShardHealth,
  computeRebalanceMoves,
} from './shard-coordinator-helpers';

export class ShardCoordinator {
  private state: DurableObjectState;
  private config: ShardCoordinatorConfig;
  private ring: HashRing;
  private topology: ShardTopology;
  private locks: Map<string, DistributedLock> = new Map();
  private initPromise: Promise<void>;

  constructor(state: DurableObjectState, config?: Partial<ShardCoordinatorConfig>) {
    this.state = state;
    this.config = {
      totalShards: config?.totalShards ?? 12,
      virtualNodesPerShard: config?.virtualNodesPerShard ?? 100,
      heartbeatTimeoutMs: config?.heartbeatTimeoutMs ?? 30000,
      lockTtlMs: config?.lockTtlMs ?? 10000,
    };
    this.topology = createInitialTopology(this.config.totalShards);
    this.ring = buildRing(this.config.totalShards, this.config.virtualNodesPerShard);

    this.initPromise = this.initializeState().catch((err: unknown) => {
      logger.error('[ShardCoordinator] Init failed:', { err });
    });

    if (typeof this.state.blockConcurrencyWhile === 'function') {
      this.state.blockConcurrencyWhile(() => this.initPromise).catch((err: unknown) => {
        logger.error('[ShardCoordinator] blockConcurrencyWhile error:', { err });
      });
    }
  }

  async ready(): Promise<void> {
    await this.initPromise;
  }

  async initializeState(): Promise<void> {
    const stored = (await this.state.storage?.get<ShardTopology>('topology')) ?? null;
    if (stored && stored.shards.length > 0) {
      this.topology = stored;
    } else {
      await this.state.storage?.put('topology', this.topology);
    }
  }

  getTopology(): ShardTopology {
    return { ...this.topology };
  }

  routeStrategy(strategyId: string): number {
    return routeStrategyToShard(this.ring, this.topology.shards, strategyId);
  }

  heartbeat(shardId: number, strategyCount = 0): void {
    const node = this.topology.shards.find((s) => s.shardId === shardId);
    if (node) {
      node.lastHeartbeat = Date.now();
      node.status = 'HEALTHY';
      node.strategyCount = strategyCount;
    }
  }

  checkHealth(): ShardNode[] {
    return evaluateShardHealth(this.topology.shards, this.config.heartbeatTimeoutMs);
  }

  async acquireLock(resourceId: string, ownerShardId: number, ttlMs?: number): Promise<LockAcquisitionResult> {
    const now = Date.now();
    const ttl = ttlMs ?? this.config.lockTtlMs;
    const existing = this.locks.get(resourceId);

    if (existing && existing.expiresAt > now && existing.ownerShardId !== ownerShardId) {
      return { acquired: false, error: `Resource ${resourceId} locked by shard ${existing.ownerShardId}` };
    }

    const lock: DistributedLock = {
      lockId: `${resourceId}:${ownerShardId}:${now}`,
      resourceId, ownerShardId, acquiredAt: now, expiresAt: now + ttl, ttlMs: ttl,
    };
    this.locks.set(resourceId, lock);
    await this.state.storage?.put(`lock:${resourceId}`, lock);
    return { acquired: true, lock };
  }

  async releaseLock(resourceId: string, ownerShardId: number): Promise<boolean> {
    const existing = this.locks.get(resourceId);
    if (!existing || existing.ownerShardId !== ownerShardId) return false;
    this.locks.delete(resourceId);
    await this.state.storage?.delete(`lock:${resourceId}`);
    return true;
  }

  generateRebalancePlan(assignedStrategies: Map<number, string[]>): RebalancePlan {
    this.checkHealth();
    const healthyShards = this.topology.shards.filter((s) => s.status === 'HEALTHY');
    if (healthyShards.length === 0) {
      return { moves: [], targetVersion: this.topology.version, generatedAt: Date.now() };
    }

    const moves = computeRebalanceMoves(this.topology.shards, assignedStrategies);
    this.topology.version += 1;
    this.topology.updatedAt = Date.now();
    return { moves, targetVersion: this.topology.version, generatedAt: Date.now() };
  }
}
