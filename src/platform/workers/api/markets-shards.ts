import { logger } from '../../../shared/utils/logger';
import {
  type Env,
  type EnvAny,
  corsHeaders,
  isAdmin,
  jsonH,
  unauthorized,
  methodNotAllowed,
} from './markets-types';

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
    const info = (await res.json()) as { shardId: number; strategies: string[]; strategiesLoaded: number; metrics: Record<string, unknown> };
    return new Response(JSON.stringify(info), { headers: jsonH(env) });
  } catch (err) {
    logger.error('[markets] shard info fetch failed', { shardId, error: String(err) });
    return new Response(JSON.stringify({ error: `Shard ${shardId} unreachable` }), { status: 502, headers: jsonH(env) });
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
    const strategies = shardMetrics.map((m) => ({ shardId: m.shardId, count: m.strategyCount }));
    return new Response(JSON.stringify({ shards: strategies }), { headers: jsonH(env) });
  } catch {
    return new Response(JSON.stringify({ shards: [] }), { headers: jsonH(env) });
  }
}
