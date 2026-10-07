/**
 * Shard Coordinator Types
 * Shard topology, health checks, rebalancing plans, and distributed lock definitions.
 */

export type ShardNodeStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface ShardNode {
  shardId: number;
  region: string;
  endpoint: string;
  status: ShardNodeStatus;
  weight: number;
  lastHeartbeat: number;
  strategyCount: number;
}

export interface ShardTopology {
  version: number;
  regions: string[];
  shards: ShardNode[];
  updatedAt: number;
}

export interface DistributedLock {
  lockId: string;
  resourceId: string;
  ownerShardId: number;
  acquiredAt: number;
  expiresAt: number;
  ttlMs: number;
}

export interface RebalanceMove {
  strategyId: string;
  fromShardId: number;
  toShardId: number;
  reason: string;
}

export interface RebalancePlan {
  moves: RebalanceMove[];
  targetVersion: number;
  generatedAt: number;
}

export interface ShardCoordinatorConfig {
  totalShards: number;
  virtualNodesPerShard: number;
  heartbeatTimeoutMs: number;
  lockTtlMs: number;
}

export interface LockAcquisitionResult {
  acquired: boolean;
  lock?: DistributedLock;
  error?: string;
}
