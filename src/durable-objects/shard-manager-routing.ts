/**
 * Standalone routing / assignment / balancing utilities for the hash ring.
 *
 * Pure functions (no class dependency) — the ShardManager Durable Object
 * delegates its public routing API to these helpers.
 */

import type { RedisClientType } from '../redis';
import {
  buildRing,
  getShardForStrategy,
  getDistribution,
  isBalanced,
} from '../desk/utils/consistent-hash';
import type { HashRing } from '../desk/utils/consistent-hash';
import { TOTAL_SHARDS, VIRTUAL_NODES_PER_SHARD } from './shard-manager-types';
import type { ShardHealth } from './shard-manager-types';

/**
 * Map a strategy ID to its shard index using the consistent hash ring.
 * Returns -1 when the ring is not initialized.
 */
export function getShardAssignment(ring: HashRing | null, strategyId: string): number {
  if (!ring) return -1;
  return getShardForStrategy(ring, strategyId);
}

/**
 * Compute the full ring state: assignments per shard, distribution percentages,
 * balance flag, and total strategy count.
 */
export function computeRingState(
  ring: HashRing | null,
  allStrategyIds: string[],
): {
  totalShards: number;
  virtualNodesPerShard: number;
  distribution: Map<number, number>;
  balanced: boolean;
} {
  if (!ring) {
    const emptyDistribution = new Map<number, number>();
    for (let i = 0; i < TOTAL_SHARDS; i++) {
      emptyDistribution.set(i, 0);
    }
    return { totalShards: TOTAL_SHARDS, virtualNodesPerShard: VIRTUAL_NODES_PER_SHARD, distribution: emptyDistribution, balanced: true };
  }

  const distribution = getDistribution(ring, allStrategyIds);
  return { totalShards: TOTAL_SHARDS, virtualNodesPerShard: VIRTUAL_NODES_PER_SHARD, distribution, balanced: isBalanced(distribution) };
}

/**
 * Build a fresh hash ring from scratch using default parameters.
 */
export function rebuildRing(): HashRing {
  return buildRing(TOTAL_SHARDS, VIRTUAL_NODES_PER_SHARD);
}

/**
 * Compute rebalance metrics: current distribution, deviation, isBalanced,
 * and number of moves needed if rebalance were applied.
 */
export function collectRingMetrics(
  ring: HashRing | null,
  previousDistribution: Record<number, number> | null,
): {
  currentDistribution: Record<number, number>;
  deviation: number;
  isBalanced: boolean;
  movesNeeded: number;
} {
  if (!ring) {
    const dist: Record<number, number> = {};
    for (let i = 0; i < TOTAL_SHARDS; i++) dist[i] = 0;
    return { currentDistribution: dist, deviation: 0, isBalanced: true, movesNeeded: 0 };
  }

  const distMap = getDistribution(ring, []);
  const currentDistribution: Record<number, number> = {};
  for (let i = 0; i < TOTAL_SHARDS; i++) {
    currentDistribution[i] = distMap.get(i) ?? 0;
  }
  const balanced = isBalanced(distMap);

  let deviation = 0;
  const prev = previousDistribution ?? currentDistribution;
  for (let i = 0; i < TOTAL_SHARDS; i++) {
    deviation += Math.abs((currentDistribution[i] ?? 0) - (prev[i] ?? 0));
  }
  deviation /= TOTAL_SHARDS;

  const ideal = 100 / TOTAL_SHARDS;
  let movesNeeded = 0;
  for (let i = 0; i < TOTAL_SHARDS; i++) {
    const diff = Math.abs((currentDistribution[i] ?? 0) - ideal);
    if (diff > ideal * 0.1) movesNeeded++;
  }

  return { currentDistribution, deviation, isBalanced: balanced, movesNeeded };
}

/**
 * Factory for a default ShardHealth record.
 */
export function createDefaultShardHealth(shardId: number): ShardHealth {
  return {
    shardId,
    lastHeartbeat: Date.now(),
    rps: 0,
    avgLatencyMs: 0,
    errorCount: 0,
    strategyCount: 0,
    status: 'healthy',
  };
}

/**
 * Minimal storage interface needed by fetchAllStrategyIds.
 * Keeps us decoupled from the full DurableObjectStorage type
 * which differs between @cloudflare/workers-types and global declarations.
 */
interface MinimalStorage {
  list(options?: unknown): Promise<Map<string, unknown>>;
}

/**
 * Fetch all known strategy IDs — merge Redis sorted-set members with
 * whatever keys exist in storage under `strategy:`.
 */
export async function fetchAllStrategyIds(
  redis: RedisClientType | null,
  storage: MinimalStorage,
): Promise<string[]> {
  const strategyIds: Set<string> = new Set();

  if (redis) {
    try {
      const memberResult = await redis.zrange('strategy:registry', 0, -1);
      for (const member of memberResult) strategyIds.add(member);
    } catch {
      // Redis unavailable — fall through to storage only
    }
  }

  const storageKeys = await storage.list();
  for (const key of storageKeys.keys()) {
    if (key.startsWith('strategy:')) strategyIds.add(key.replace('strategy:', ''));
  }

  return [...strategyIds];
}
