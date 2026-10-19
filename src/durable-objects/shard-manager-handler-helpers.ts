/**
 * Shard Manager — Pure Auth, Metrics & Response Formatting Helpers
 */

import type { RingStateResponse, ShardHealth, ShardMetrics } from './shard-manager-types';

/**
 * Timing-safe check for admin API key — prevents timing attacks on the bearer token.
 */
export function isAdminAuth(request: Request, env?: { ADMIN_API_KEY?: string }): boolean {
  const key = env?.ADMIN_API_KEY;
  if (!key) return false;
  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${key}`;
  if (auth.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < auth.length; i++) {
    diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Build health check response for the /health endpoint.
 */
export function handleHealthCheck(
  ringState: RingStateResponse,
  shardHealth: Map<number, ShardHealth>,
): Response {
  return Response.json({
    status: 'ok',
    ring: ringState,
    shardHealth: Object.fromEntries(shardHealth),
  });
}

/**
 * Build metrics response for the /shard/metrics endpoint.
 */
export function handleMetrics(shardMetrics: Map<number, ShardMetrics>): Response {
  const metrics: Record<number, { errorCount: number; lastUpdated: number }> = {};
  for (const [shardId, m] of shardMetrics.entries()) {
    metrics[shardId] = { errorCount: m.errors, lastUpdated: m.lastUpdated };
  }
  return Response.json(metrics);
}

/** Record a single request metric observation for a shard. */
export function applyMetricUpdate(
  shardMetrics: Map<number, ShardMetrics>,
  shardId: number,
  latencyMs: number,
  success: boolean,
): void {
  let m = shardMetrics.get(shardId);
  if (!m) {
    m = { requests: 0, errors: 0, totalLatencyMs: 0, lastUpdated: Date.now() };
    shardMetrics.set(shardId, m);
  }
  m.requests++;
  m.totalLatencyMs += latencyMs;
  if (!success) m.errors++;
  m.lastUpdated = Date.now();
}

/** Roll up accumulated shard metrics into health records and reset counters. */
export function flushMetricsToHealth(
  shardMetrics: Map<number, ShardMetrics>,
  updateShardHealth: (shardId: number, health: Partial<ShardHealth>) => void,
): void {
  for (const [shardId, metrics] of shardMetrics.entries()) {
    const avgLatency = metrics.requests > 0 ? metrics.totalLatencyMs / metrics.requests : 0;
    updateShardHealth(shardId, { rps: metrics.requests / 10, avgLatencyMs: avgLatency });
    metrics.requests = 0;
    metrics.errors = 0;
    metrics.totalLatencyMs = 0;
  }
}
