/**
 * Shard metrics utilities — standalone functions for computing and formatting
 * metrics data from StrategyShard instances.
 */

import type { ShardMetrics } from './strategy-shard';

/**
 * Get memory info (Cloudflare Workers specific).
 * Extracted from StrategyShard for reuse and testability.
 */
export function getMemoryInfo(): { rss: number; heapUsed: number } {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = (performance as Record<string, unknown>).memory as Record<string, number>;
    return {
      rss: mem.rss,
      heapUsed: mem.usedJSHeapSize,
    };
  }
  return { rss: 0, heapUsed: 0 };
}

/**
 * Compute average latency from metrics.
 */
export function computeAvgLatency(metrics: ShardMetrics): number {
  return metrics.requests > 0 ? metrics.totalLatencyMs / metrics.requests : 0;
}

/**
 * Format metrics into a JSON-serializable summary for the /metrics endpoint.
 */
export function formatMetricsResponse(
  shardId: number,
  metrics: ShardMetrics,
): Record<string, unknown> {
  return {
    shardId,
    ...metrics,
    avgLatencyMs: computeAvgLatency(metrics),
  };
}
