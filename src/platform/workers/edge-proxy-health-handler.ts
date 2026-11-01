/**
 * Edge Proxy — D1 Readiness & Health Route Handler
 *
 * Extracted from edge-proxy-inline-routes.ts to keep modules under 200 LOC.
 */

import { logger } from '../../shared/utils/logger';
import { CORS, SECURITY_HEADERS } from './edge-proxy-constants';
import type { Env } from './edge-proxy-types';

const JSON_HEADERS = { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' } as const;

export async function handleHealthRoute(env: Env, routingEnabled: boolean): Promise<Response> {
  const db = env.SUBSCRIBERS || env.DB;
  const d1Bound = Boolean(db);
  let d1QueryStatus = 'unbound';
  let schemaReady = false;
  let sanitizedErrorMessage: string | undefined;

  const schemaChecks = {
    subscriptions: false,
    paperTrades: false,
    columns: {
      subscriptions: false,
      paperTrades: false,
    },
  };

  if (d1Bound && db) {
    try {
      const probe = await db.prepare('SELECT 1 as ready').first<{ ready: number }>();
      d1QueryStatus = probe ? 'ready' : 'query_empty';

      try {
        await db.prepare(
          'SELECT id, user_id, status, tier, created_at FROM subscriptions LIMIT 1',
        ).first();
        schemaChecks.subscriptions = true;
        schemaChecks.columns.subscriptions = true;
      } catch {
        schemaChecks.subscriptions = false;
        schemaChecks.columns.subscriptions = false;
        sanitizedErrorMessage = 'subscriptions schema verification failed';
      }

      try {
        await db.prepare(
          'SELECT id, market_id, side, size_usd, entry_price, status, strategy, created_at FROM paper_trades_v3 LIMIT 1',
        ).first();
        schemaChecks.paperTrades = true;
        schemaChecks.columns.paperTrades = true;
      } catch {
        schemaChecks.paperTrades = false;
        schemaChecks.columns.paperTrades = false;
        sanitizedErrorMessage = sanitizedErrorMessage || 'paper_trades_v3 schema verification failed';
      }

      schemaReady = schemaChecks.subscriptions &&
                    schemaChecks.paperTrades &&
                    schemaChecks.columns.subscriptions &&
                    schemaChecks.columns.paperTrades;
    } catch (err) {
      d1QueryStatus = 'query_failed';
      sanitizedErrorMessage = 'D1 connection probe failed';
      logger.warn('[EdgeProxy] health route D1 probe failed', { err });
    }
  } else {
    d1QueryStatus = 'missing';
    schemaReady = false;
    sanitizedErrorMessage = 'D1 database binding missing';
  }

  const isHealthy = d1Bound && d1QueryStatus === 'ready' && schemaReady;
  const status = isHealthy ? 'ok' : 'degraded';
  const httpStatus = isHealthy ? 200 : 503;

  const responseBody: Record<string, unknown> = {
    status,
    service: 'Cloudflare Worker Edge Proxy',
    environment: env.ENVIRONMENT,
    edge: 'cloudflare',
    hasVps: !!env.VPS_ORIGIN,
    timestamp: new Date().toISOString(),
    checks: {
      kv: env.CACHE ? 'configured' : 'missing',
      d1: d1Bound ? 'configured' : 'missing',
      metrics: !!env.METRIC_PASSWORD,
      regionRouting: routingEnabled,
    },
    readiness: {
      d1: d1QueryStatus,
      schema: schemaReady ? 'ready' : (d1Bound ? 'degraded' : 'unbound'),
      details: schemaChecks,
    },
  };

  if (!isHealthy && sanitizedErrorMessage) {
    responseBody.error = sanitizedErrorMessage;
  }

  return new Response(JSON.stringify(responseBody), { status: httpStatus, headers: JSON_HEADERS });
}
