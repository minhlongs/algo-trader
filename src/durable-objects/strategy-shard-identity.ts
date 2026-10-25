/**
 * Strategy Shard Identity & Heartbeat
 *
 * Deterministic shard-id derivation (FNV-1a over the Durable Object id) and the
 * health snapshot the shard alarm persists. Extracted so the Durable Object
 * class keeps only lifecycle/routing and the hashing + heartbeat shapes are
 * testable without a DO runtime.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';

/** Total shard slots a deployment addresses. */
export const SHARD_COUNT = 12;

/** FNV-1a offset basis (2166136261) as a uint32 seed. */
const FNV_OFFSET_BASIS = 2166136261 >>> 0;

/** Status a shard reports when its execution slots are saturated. */
export type ShardHealthStatus = 'healthy' | 'degraded';

/** Heartbeat snapshot persisted by the alarm and reported to the ShardManager. */
export interface ShardHealthSnapshot {
  shardId: number;
  lastHeartbeat: number;
  rps: number;
  avgLatencyMs: number;
  errorCount: number;
  strategyCount: number;
  status: ShardHealthStatus;
  [key: string]: unknown;
}

/** Metrics fields the heartbeat is derived from. */
export interface ShardHeartbeatInput {
  requests: number;
  errors: number;
  totalLatencyMs: number;
}

/**
 * Derive a stable shard index in [0, SHARD_COUNT) from a Durable Object id.
 *
 * Same id → same shard, so a re-created DO instance owns the same slot.
 */
export function deriveShardId(state: DurableObjectState): number {
  const id = state.id.toString();
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = ((hash << 1) + (hash >>> 31) + (hash << 4) + (hash >>> 27)) >>> 0;
  }
  return hash % SHARD_COUNT;
}

/**
 * Build the alarm heartbeat for a shard. Requests are counted over a 10-second
 * alarm window, so rps is requests/10.
 */
export function buildShardHealth(
  shardId: number,
  metrics: ShardHeartbeatInput,
  strategyCount: number,
  activeExecutions: number,
  maxConcurrent: number,
): ShardHealthSnapshot {
  const avgLatencyMs = metrics.requests > 0 ? metrics.totalLatencyMs / metrics.requests : 0;
  return {
    shardId,
    lastHeartbeat: Date.now(),
    rps: metrics.requests / 10,
    avgLatencyMs,
    errorCount: metrics.errors,
    strategyCount,
    status: activeExecutions < maxConcurrent ? 'healthy' : 'degraded',
  };
}
