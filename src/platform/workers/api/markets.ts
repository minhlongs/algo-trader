/**
 * Markets & Strategies API — queries StrategyShard DOs via ShardManager.
 *
 * Endpoints:
 * GET  /api/v1/shard/ring          — hash ring state (admin key)
 * GET  /api/v1/shard/health        — all shard health
 * GET  /api/v1/shard/:id/health    — single shard health
 * GET  /api/v1/shard/:id/info      — strategies on shard
 * POST /api/v1/strategies/execute   — execute strategy on target shard
 * GET  /api/v1/strategies/list     — list known strategy IDs (admin)
 * GET  /api/markets                — public market list placeholder
 */

import { logger } from '../../../shared/utils/logger';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

type Env = {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
};

// Loose DO access — envoy pattern avoids cross-module struct TS errors
type EnvAny = Env & Record<string, unknown>;

function corsHeaders(env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function isAdmin(request: Request, env: Env): boolean {
  const apiKey = request.headers.get('x-api-key');
  const adminKey = (env as any).ADMIN_API_KEY;
  return !!(apiKey && adminKey && apiKey === adminKey);
}

// ──────────────────────────────────────────────
// Route handlers
// ──────────────────────────────────────────────

export async function handleGetRing(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method !== 'GET') return methodNotAllowed(env);
  if (!isAdmin(request, env)) return unauthorized(env);

  const sm = (env as EnvAny).SHARD_MANAGER;
  if (!sm) return new Response(JSON.stringify({ error: 'ShardManager not bound' }), { status: 503, headers: jsonH(env) });

  try {
    const res = await (sm as any).fetch('https://algo-trader.workers.dev/admin/shard/ring');
    const ringData = await res.json();
    const ring = ringData as { totalShards: number; virtualNodesPerShard: number; distribution: Record<string, number>; balanced: boolean };
    return new Response(JSON.stringify(ring), { headers: jsonH(env) });
  } catch (err) {
    logger.error('[markets] ring fetch failed', { error: String(err) });
    return new Response(JSON.stringify({ error: 'ShardManager unreachable' }), { status: 502, headers: jsonH(env) });
  }
}

export async function handleGetShardHealth(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method !== 'GET') return methodNotAllowed(env);
  if (!isAdmin(request, env)) return unauthorized(env);

  const sm = (env as EnvAny).SHARD_MANAGER;
  if (!sm) {
    const cached = await env.CACHE.get('region:health');
    if (cached) return new Response(cached, { headers: jsonH(env) });
    return new Response(JSON.stringify({ error: 'ShardManager not bound, no cache' }), { status: 503, headers: jsonH(env) });
  }

  try {
    const res = await (sm as any).fetch('https://algo-trader.workers.dev/admin/shard/health');
    const healthArr = await res.json();
    const shards = healthArr as Array<{ shardId: number; lastHeartbeat: number; rps: number; avgLatencyMs: number; status: string }>;
    return new Response(JSON.stringify({ shards }), { headers: jsonH(env) });
  } catch (err) {
    logger.error('[markets] health fetch failed', { error: String(err) });
    return new Response(JSON.stringify({ error: 'ShardManager unreachable' }), { status: 502, headers: jsonH(env) });
  }
}

export async function handleGetShardById(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method !== 'GET') return methodNotAllowed(env);
  if (!isAdmin(request, env)) return unauthorized(env);

  const url = new URL(request.url);
  const shardId = parseInt(url.pathname.split('/').pop() || '0', 10);
  if (isNaN(shardId) || shardId < 0 || shardId > 11) {
    return new Response(JSON.stringify({ error: 'shardId must be 0-11' }), { status: 400, headers: jsonH(env) });
  }

  // Access DO binding dynamically (env typed as EnvAny)
  const doId = (env as EnvAny)[`SHARD_${shardId}`];
  if (!doId) {
    return new Response(JSON.stringify({ error: `SHARD_${shardId} not bound` }), { status: 503, headers: jsonH(env) });
  }

  try {
    const res = await (doId as any).fetch('https://algo-trader.workers.dev/info');
    const info = await res.json() as { shardId: number; strategies: string[]; strategiesLoaded: number; metrics: Record<string, unknown> };
    return new Response(JSON.stringify(info), { headers: jsonH(env) });
  } catch (err) {
    logger.error('[markets] shard info fetch failed', { shardId, error: String(err) });
    return new Response(JSON.stringify({ error: `Shard ${shardId} unreachable` }), { status: 502, headers: jsonH(env) });
  }
}

export async function handleExecuteStrategy(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method !== 'POST') return methodNotAllowed(env);

  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return unauthorized(env);

  try {
    const body: { strategyId: string; marketData: Record<string, unknown>; capitalUsdt?: number } = await request.json();
    if (!body.strategyId) return new Response(JSON.stringify({ error: 'strategyId required' }), { status: 400, headers: jsonH(env) });

    const sm = (env as EnvAny).SHARD_MANAGER;
    if (!sm) return new Response(JSON.stringify({ error: 'ShardManager not bound' }), { status: 503, headers: jsonH(env) });

    // Ask ShardManager which shard owns this strategy
    const routeRes = await (sm as any).fetch(`https://algo-trader.workers.dev/admin/shard/ring?strategyId=${encodeURIComponent(body.strategyId)}`);
    if (!routeRes.ok) return new Response(JSON.stringify({ error: 'Strategy routing failed' }), { status: 502, headers: jsonH(env) });
    const routeData = await routeRes.json() as { shardId: number };
    const shardId = routeData.shardId;

    const doId = (env as EnvAny)[`SHARD_${shardId}`];
    if (!doId) return new Response(JSON.stringify({ error: `SHARD_${shardId} not bound` }), { status: 503, headers: jsonH(env) });

    // Forward execution request to shard DO
    const execRes = await (doId as any).fetch('https://algo-trader.workers.dev/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } as any);
    const execResult = await execRes.json() as { success: boolean; strategyId: string; signal?: string; confidence?: number; latencyMs?: number; error?: string };
    return new Response(JSON.stringify(execResult), { status: execRes.status || 200, headers: jsonH(env) });
  } catch (err) {
    logger.error('[markets] execute error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Strategy execution failed', detail: String(err) }), { status: 500, headers: jsonH(env) });
  }
}

export async function handleGetStrategiesList(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  if (request.method !== 'GET') return methodNotAllowed(env);
  if (!isAdmin(request, env)) return unauthorized(env);

  const sm = (env as EnvAny).SHARD_MANAGER;
  if (!sm) {
    const cached = await env.CACHE.get('strategies:registry');
    if (cached) return new Response(cached, { headers: jsonH(env) });
    return new Response(JSON.stringify({ error: 'ShardManager not bound' }), { status: 503, headers: jsonH(env) });
  }

  try {
    const res = await (sm as any).fetch('https://algo-trader.workers.dev/admin/shard/metrics');
    const metricsArr = await res.json();
    const shardMetrics = metricsArr as Array<{ shardId: number; strategyCount: number }>;
    const strategies = shardMetrics.map(m => ({ shardId: m.shardId, count: m.strategyCount }));
    return new Response(JSON.stringify({ shards: strategies }), { headers: jsonH(env) });
  } catch {
    return new Response(JSON.stringify({ shards: [] }), { headers: jsonH(env) });
  }
}

export async function handleGetMarkets(_request: Request, _env: Env): Promise<Response> {
  const markets = [
    { symbol: 'BTCUSDT', exchange: 'Binance', price: 0, change24h: 0 },
    { symbol: 'ETHUSDT', exchange: 'Binance', price: 0, change24h: 0 },
    { symbol: 'SOLUSDT', exchange: 'Binance', price: 0, change24h: 0 },
  ];
  return new Response(JSON.stringify({ markets, note: 'Live prices require market data pipeline' }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cache': 'MISS' },
  });
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function jsonH(env: Env): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',')[0] };
}

function unauthorized(env: Env): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized — x-api-key required' }), { status: 401, headers: jsonH(env) });
}

function methodNotAllowed(env: Env): Response {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonH(env) });
}
