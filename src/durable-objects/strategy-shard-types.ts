/**
 * Type definitions and constants for StrategyShard.
 * Extracted from strategy-shard.ts for modularity.
 */

/** Env interface for Durable Object bindings (KV, DO references) */
export interface Env {
  STRATEGY_KV?: KVNamespace;
  SHARD_MANAGER?: unknown;
  STRATEGY_STATE: DurableObjectNamespace;
}

/** Result of a single strategy execution */
export interface ShardExecutionResult {
  success: boolean;
  strategyId: string;
  signal?: string;
  confidence?: number;
  latencyMs: number;
  shardId?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

/** Aggregated metrics for the shard */
export interface ShardMetrics {
  requests: number;
  totalLatencyMs: number;
  errors: number;
  queueLength: number;
  strategiesLoaded: number;
  lastUpdated: number;
}
