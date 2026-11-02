/**
 * Edge Proxy — Inline Route Handlers
 *
 * Houses inline D1/KV route handlers that were previously embedded
 * in the main fetch() body. Health route extracted to edge-proxy-health-handler.ts.
 */

import { logger } from '../../shared/utils/logger';
import { CORS, SECURITY_HEADERS } from './edge-proxy-constants';
import { verifyJwt } from './crypto-utils';
import type { Env } from './edge-proxy-types';

export { handleHealthRoute } from './edge-proxy-health-handler';

const JSON_HEADERS = { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' } as const;

// ── Settings save (KV) ────────────────────────────────────────────────────────

export async function handleTenantConfigSave(request: Request, env: Env, path: string): Promise<Response> {
  try {
    const tenantId = path.split('/')[3];
    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Tenant ID required' }), {
        status: 400, headers: JSON_HEADERS,
      });
    }

    if (!env.JWT_SECRET) {
      logger.warn('[EdgeProxy] tenant config write rejected: JWT_SECRET not configured');
      return new Response(JSON.stringify({ error: 'Authentication not configured' }), {
        status: 401, headers: JSON_HEADERS,
      });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Bearer token required' }), {
        status: 401, headers: JSON_HEADERS,
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Empty token' }), {
        status: 401, headers: JSON_HEADERS,
      });
    }

    const payload = await verifyJwt(token, env.JWT_SECRET);
    if (!payload) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), {
        status: 401, headers: JSON_HEADERS,
      });
    }

    const tokenTenantId = typeof payload.tenantId === 'string' ? payload.tenantId : '';
    const isAdmin = payload.role === 'admin';
    if (!isAdmin && tokenTenantId !== tenantId) {
      logger.warn('[EdgeProxy] tenant config cross-tenant write rejected', {
        requestedTenant: tenantId,
        tokenTenant: tokenTenantId,
      });
      return new Response(JSON.stringify({ error: 'Forbidden: Cross-tenant modification denied' }), {
        status: 403, headers: JSON_HEADERS,
      });
    }

    const body = await request.json();
    await env.CACHE.put(`config:${tenantId}`, JSON.stringify(body));
    return new Response(JSON.stringify({ saved: true }), { headers: JSON_HEADERS });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to save' }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
}

// ── Paper trades ledger (D1-backed, read-only) ────────────────────────────────

export async function handlePaperTradesLedger(_request: Request, env: Env): Promise<Response> {
  try {
    const db = env.SUBSCRIBERS;
    if (!db) {
      return new Response(JSON.stringify({ error: 'D1 not configured' }), {
        status: 500, headers: JSON_HEADERS,
      });
    }
    const result = await db
      .prepare(
        `SELECT id, market_id AS tokenId, side, size_usd AS size, entry_price AS price,
             pnl, strategy, source, created_at AS timestamp
           FROM paper_trades_v3 ORDER BY created_at DESC LIMIT 1000`,
      )
      .all();
    const trades = (result.results ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      tokenId: String(r.tokenId),
      side: r.side === 'YES' || r.side === 'NO' ? (r.side === 'YES' ? 'BUY' : 'SELL') : String(r.side),
      price: Number(r.price),
      size: Number(r.size),
      pnl: r.pnl == null ? null : Number(r.pnl),
      strategy: String(r.strategy),
      source: String(r.source),
      timestamp: new Date(Number(r.timestamp)).toISOString(),
    }));
    return new Response(JSON.stringify({ trades, count: trades.length }), {
      status: 200, headers: JSON_HEADERS,
    });
  } catch (err) {
    logger.error('[EdgeProxy] paper-trades query failed', { err });
    return new Response(JSON.stringify({ error: 'Query failed' }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
}

export function handleRootRoute(env: Env): Response {
  return new Response(JSON.stringify({
    service: 'algo-trader API', version: '1.0', status: 'ok', edge: 'cloudflare',
    environment: env.ENVIRONMENT, hasVps: !!env.VPS_ORIGIN, timestamp: new Date().toISOString(),
  }), { headers: JSON_HEADERS });
}

export function handleVpsFallbackRoute(): Response {
  return new Response(
    JSON.stringify({ error: 'Not implemented', message: 'VPS backend removed — endpoint not yet migrated to CF Worker' }),
    { status: 501, headers: JSON_HEADERS },
  );
}

export function handleMetricsGetRoute(
  url: URL,
  env: Env,
  metricsHandler: (env: Env) => Promise<Response> | Response,
): Promise<Response> | Response {
  const secret = env.METRIC_PASSWORD;
  if (secret && url.searchParams.get('token') !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: JSON_HEADERS,
    });
  }
  return metricsHandler(env);
}

export async function handlePaperTradingTickRoute(
  env: Env,
  runTick: () => Promise<unknown>,
  request?: Request,
): Promise<Response> {
  if (env.ADMIN_API_KEY && request?.headers.get('x-api-key') !== env.ADMIN_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS });
  }
  try {
    const result = await runTick();
    return new Response(JSON.stringify({
      ok: true, triggered: 'manual', kvNamespace: env.CACHE ? 'bound' : 'UNDEFINED',
      hasCache: !!env.CACHE, hasDb: !!env.SUBSCRIBERS, dbType: typeof env.SUBSCRIBERS, result,
    }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[EdgeProxy] Paper trading tick failed', { err });
    return new Response(JSON.stringify({ error: 'Tick failed', err: String(err) }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
}

export async function handlePaperTradingStatusRoute(
  getStatus: () => Promise<unknown>,
): Promise<Response> {
  try {
    const status = await getStatus();
    return new Response(JSON.stringify(status), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[EdgeProxy] Paper trading status failed', { err });
    return new Response(JSON.stringify({ error: 'Status query failed', err: String(err) }), {
      status: 500, headers: JSON_HEADERS,
    });
  }
}
