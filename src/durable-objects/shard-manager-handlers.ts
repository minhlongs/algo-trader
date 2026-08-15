/**
 * Shard Manager — HTTP request handlers for admin API and health check endpoints.
 *
 * Pure functions that handle admin API routing and health responses.
 * Extracted from shard-manager.ts to keep individual modules under 200 lines.
 */

import { logger } from '../shared/utils/logger';
import type { ShardHealth, ShardMetrics, RingStateResponse } from './shard-manager-types';

/** Minimal context needed by admin/health handlers. */
export interface HandlerContext {
  storage: unknown;
  shardHealth: Map<number, ShardHealth>;
  shardMetrics: Map<number, ShardMetrics>;
}

/** Callbacks for operations that require Durable Object state. */
export interface HandlerCallbacks {
  getRingState: () => RingStateResponse;
  rebalance: () => Promise<{ previous: Map<number, number>; updated: Map<number, number> }>;
  updateShardHealth: (shardId: number, health: Partial<ShardHealth>) => Promise<void> | void;
}

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
export function handleHealthCheck(ringState: RingStateResponse, shardHealth: Map<number, ShardHealth>): Response {
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

/**
 * Route an admin request to the appropriate handler.
 *
 * Supported endpoints (all require admin auth):
 * - GET  /admin/ring          → ring state overview
 * - POST /admin/ring/rebalance → force ring rebuild
 * - GET  /admin/shard/:id/health  → single shard health
 * - GET  /admin/shard/:id/metrics → single shard metrics
 */
export async function handleAdminRequest(
  request: Request,
  ctx: HandlerContext,
  callbacks: HandlerCallbacks,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/admin/ring' && request.method === 'GET') {
      return Response.json(callbacks.getRingState());
    }

    if (path === '/admin/ring/rebalance' && request.method === 'POST') {
      const result = await callbacks.rebalance();
      return Response.json({
        rebalanced: true,
        previous: Object.fromEntries(result.previous),
        updated: Object.fromEntries(result.updated),
      });
    }

    const healthMatch = path.match(/^\/admin\/shard\/(\d+)\/health$/);
    if (healthMatch && request.method === 'GET') {
      const shardId = Number(healthMatch[1]);
      const health = ctx.shardHealth.get(shardId);
      if (!health) return Response.json({ error: 'Shard not found' }, { status: 404 });
      return Response.json(health);
    }

    const metricsMatch = path.match(/^\/admin\/shard\/(\d+)\/metrics$/);
    if (metricsMatch && request.method === 'GET') {
      const shardId = Number(metricsMatch[1]);
      const metrics = ctx.shardMetrics.get(shardId);
      if (!metrics) return Response.json({ error: 'Metrics not found' }, { status: 404 });
      return Response.json({ shardId, ...metrics });
    }

    return Response.json({ error: 'Unknown admin endpoint' }, { status: 404 });
  } catch (error) {
    logger.error('[ShardManager] Admin request error:', { error, path });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
