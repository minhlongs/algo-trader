/**
 * Shard Manager types and configuration constants
 *
 * Shared between the ShardManager Durable Object and routing utilities.
 */

/** Number of shards in the hash ring */
export const TOTAL_SHARDS = 12;

/** Virtual nodes per shard for consistent hash distribution */
export const VIRTUAL_NODES_PER_SHARD = 100;

/** Minimal Env interface for DO bindings (KV, Admin API key) */
export interface Env {
  SHARD_MANAGER?: unknown;
  [key: string]: unknown;
}

/** Health status of an individual shard */
export interface ShardHealth {
  shardId: number;
  lastHeartbeat: number;
  rps: number;
  avgLatencyMs: number;
  errorCount: number;
  strategyCount: number;
  status: 'healthy' | 'degraded' | 'offline';
}

/** Rolling metrics for a shard */
export interface ShardMetrics {
  requests: number;
  errors: number;
  totalLatencyMs: number;
  lastUpdated: number;
}

/** Shape of the response returned by computeRingState / getRingState */
export interface RingStateResponse {
  totalShards: number;
  virtualNodesPerShard: number;
  distribution: Map<number, number>;
  balanced: boolean;
}

/** Merge a partial health update into a shard health map with fresh heartbeat */
export function mergeShardHealthUpdate(
  shardHealths: Map<number, ShardHealth>,
  shardId: number,
  health: Partial<ShardHealth>,
  createDefault: (id: number) => ShardHealth,
): void {
  const existing = shardHealths.get(shardId) ?? createDefault(shardId);
  shardHealths.set(shardId, { ...existing, ...health, lastHeartbeat: Date.now() });
}
