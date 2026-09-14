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
import {
  type Env,
  type EnvAny,
  corsHeaders,
  jsonH,
  unauthorized,
  methodNotAllowed,
} from './markets-types';

export type { Env, EnvAny } from './markets-types';
export {
  handleGetRing,
  handleGetShardHealth,
  handleGetShardById,
  handleGetStrategiesList,
} from './markets-shards';

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
    const routeData = (await routeRes.json()) as { shardId: number };
    const shardId = routeData.shardId;

    const doId = (env as EnvAny)[`SHARD_${shardId}`];
    if (!doId) return new Response(JSON.stringify({ error: `SHARD_${shardId} not bound` }), { status: 503, headers: jsonH(env) });

    // Forward execution request to shard DO
    const execRes = await (doId as any).fetch('https://algo-trader.workers.dev/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } as any);
    const execResult = (await execRes.json()) as { success: boolean; strategyId: string; signal?: string; confidence?: number; latencyMs?: number; error?: string };
    return new Response(JSON.stringify(execResult), { status: execRes.status || 200, headers: jsonH(env) });
  } catch (err) {
    logger.error('[markets] execute error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Strategy execution failed', detail: String(err) }), { status: 500, headers: jsonH(env) });
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
