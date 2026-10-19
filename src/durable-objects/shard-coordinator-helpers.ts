/**
 * Pure shard assignment, health evaluation, and rebalance calculation helpers
 * for ShardCoordinator.
 */

import { getShardForStrategy, type HashRing } from '../desk/utils/consistent-hash';
import type {
  RebalanceMove,
  ShardNode,
  ShardTopology,
} from './shard-coordinator-types';

export const DEFAULT_REGIONS = ['us-east', 'us-west', 'eu-west', 'ap-southeast'];

export function createInitialTopology(totalShards: number, now = Date.now()): ShardTopology {
  return {
    version: 1,
    regions: DEFAULT_REGIONS,
    shards: Array.from({ length: totalShards }, (_, i) => ({
      shardId: i,
      region: DEFAULT_REGIONS[i % DEFAULT_REGIONS.length],
      endpoint: `shard-${i}.internal`,
      status: 'HEALTHY',
      weight: 1,
      lastHeartbeat: now,
      strategyCount: 0,
    })),
    updatedAt: now,
  };
}

export function routeStrategyToShard(ring: HashRing, shards: ShardNode[], strategyId: string): number {
  const candidate = getShardForStrategy(ring, strategyId);
  const node = shards.find((s) => s.shardId === candidate);
  if (node && node.status === 'HEALTHY') return candidate;

  const healthyShards = shards.filter((s) => s.status === 'HEALTHY');
  if (healthyShards.length === 0) return candidate;
  return healthyShards[Math.abs(candidate) % healthyShards.length].shardId;
}

export function evaluateShardHealth(shards: ShardNode[], heartbeatTimeoutMs: number, now = Date.now()): ShardNode[] {
  for (const node of shards) {
    const elapsed = now - node.lastHeartbeat;
    if (elapsed > heartbeatTimeoutMs * 2) node.status = 'UNHEALTHY';
    else if (elapsed > heartbeatTimeoutMs) node.status = 'DEGRADED';
  }
  return [...shards];
}

export function computeRebalanceMoves(
  shards: ShardNode[],
  assignedStrategies: Map<number, string[]>,
): RebalanceMove[] {
  const healthyShards = shards.filter((s) => s.status === 'HEALTHY');
  const moves: RebalanceMove[] = [];
  if (healthyShards.length === 0) return moves;

  for (const [shardId, strategies] of assignedStrategies.entries()) {
    const node = shards.find((s) => s.shardId === shardId);
    if (node && node.status === 'UNHEALTHY') {
      strategies.forEach((stratId, idx) => {
        const target = healthyShards[idx % healthyShards.length];
        moves.push({
          strategyId: stratId,
          fromShardId: shardId,
          toShardId: target.shardId,
          reason: `Failover from unhealthy shard ${shardId}`,
        });
      });
    }
  }
  return moves;
}
