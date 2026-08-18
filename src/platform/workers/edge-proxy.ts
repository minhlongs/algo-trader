/**
 * Cloudflare Workers Edge Proxy + Standalone Auth
 * When VPS_ORIGIN is set: proxies to backend
 * When not set: handles auth + basic data locally via KV
 *
 * This is the thin orchestrator — routing table + re-exports.
 * Types, constants, regions, and metrics live in sub-modules.
 */

// ── Backward-compatible re-exports ──
export type { Env } from './edge-proxy-types';
export { ShardManager, StrategyShard } from '../../durable-objects';

// ── Auth handlers (KV-backed, always local) ──
import {
  handleSignup, handleLogin, handleMe,
  handleListUsers, handleSetRole, handleDeleteUser,
  corsPreflightResponse, notImplementedResponse,
} from './auth-handlers';

// ── API handlers ──
import {
  handleGetMySubscription, handleUpgrade, handleCancel, handleGetTiers,
} from './api/subscriptions';
import { handleNowPaymentsIPN } from './api/webhooks-nowpayments';
import { handleValidateCoupon, handleApplyCoupon, handleRedeemCoupon, handleActivateCoupon } from './coupon-handlers';
import { handleVersion } from './api/version';
import { handleEnergy9Delivery } from './api/energy-9';
import { handleCopilotAsk } from './api/copilot';
import { handleTelegramWebhook, handleSetTelegramWebhook } from './api/telegram-bot';
import {
  handleGetRing, handleGetShardHealth, handleExecuteStrategy,
  handleGetStrategiesList, handleGetMarkets, handleGetShardById,
} from './api/markets';

// ── Internal sub-modules ──
import type { Env, CloudflareCf } from './edge-proxy-types';
import { CORS } from './edge-proxy-constants';
import {
  getClientRegion, getRegionHealth,
  selectBestRegion, routeToRegion,
} from './edge-proxy-regions';
import { handleMetrics, metricEntry } from './edge-proxy-metrics';
import { SECURITY_HEADERS } from './edge-proxy-constants';

// ── Paper trading (env-gated startup) ──
import { initPaperTrading, runPaperTradingTick } from './paper-trading-entry';
import type { PaperTradingEnv } from './paper-trading-entry';
import { logger } from '../../shared/utils/logger';
import type { KVStore } from '../../desk/paper-trading/paper-trading-loop';

/** Type alias compatible with both Env and auth-handlers Env (same KV get signatures). */
type AnyEnv = any;

// Lazy init: KV binding is only available inside fetch/scheduled handlers.
let paperTradingInitialized = false;
function ensurePaperTrading(kv?: KVStore, env?: PaperTradingEnv): void {
  if (paperTradingInitialized) return;
  paperTradingInitialized = true;
  initPaperTrading(kv, env);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    ensurePaperTrading(env.CACHE, env);
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight — also enforce HSTS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS,
          ...SECURITY_HEADERS,
        },
      });
    }

    // ── Metrics (Prometheus) ──
    if (path === '/metrics' && request.method === 'GET') {
      const secret = env.METRIC_PASSWORD;
      if (secret) {
        if (url.searchParams.get('token') !== secret) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }
      return handleMetrics(env);
    }

    if (path === '/metrics' && request.method === 'POST') {
      return metricEntry(request, env);
    }

    // ── Multi-region routing (API requests only) ──
    const routingEnabled = env.REGION_ROUTING_ENABLED !== 'false';
    if (routingEnabled && path.startsWith('/api/') && env.VPS_ORIGIN) {
      const cf = (request as unknown as { cf?: CloudflareCf }).cf;
      const clientRegion = getClientRegion(cf);
      const health = await getRegionHealth(env);
      const bestRegion = selectBestRegion(health, clientRegion);
      if (bestRegion !== env.ENVIRONMENT) {
        return await routeToRegion(request, bestRegion, env);
      }
    }

    // ── Health ──
    if (path === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'Cloudflare Worker Edge Proxy',
        environment: env.ENVIRONMENT,
        edge: 'cloudflare',
        hasVps: !!env.VPS_ORIGIN,
        timestamp: new Date().toISOString(),
        checks: {
          kv: env.CACHE ? 'configured' : 'missing',
          d1: env.DB ? 'configured' : 'missing',
          metrics: !!env.METRIC_PASSWORD,
          regionRouting: routingEnabled,
        },
      }), {
        status: 200,
        headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Root — API info ──
    if (path === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({
        service: 'algo-trader API', version: '1.0',
        status: 'ok', edge: 'cloudflare', environment: env.ENVIRONMENT,
        hasVps: !!env.VPS_ORIGIN, timestamp: new Date().toISOString(),
      }), {
        headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Auth routes (KV-backed, always local) ──
    const auth = env as AnyEnv;
    if (path === '/api/auth/signup' && request.method === 'POST') return handleSignup(request, auth);
    if (path === '/api/auth/login' && request.method === 'POST') return handleLogin(request, auth);
    if (path === '/api/auth/me' && request.method === 'GET') return handleMe(request, auth);
    if (path === '/api/auth/users' && request.method === 'GET') return handleListUsers(request, auth);
    if (path === '/api/auth/role' && request.method === 'POST') return handleSetRole(request, auth);
    if (path === '/api/auth/delete' && request.method === 'POST') return handleDeleteUser(request, auth);

    // ── Subscriptions (D1-backed) ──
    if (path === '/api/v1/subscriptions/me' && request.method === 'GET') return handleGetMySubscription(request, env);
    if (path === '/api/v1/subscriptions/upgrade' && request.method === 'POST') return handleUpgrade(request, env);
    if (path === '/api/v1/subscriptions/cancel' && request.method === 'DELETE') return handleCancel(request, env);
    if (path === '/api/v1/subscriptions/tiers' && request.method === 'GET') return handleGetTiers();

    // ── Paper trading manual tick (dev/test trigger) ──
    if (path === '/api/v1/paper-trading/tick' && request.method === 'POST') {
      try {
        ensurePaperTrading(env.CACHE, env);
        const result = await runPaperTradingTick(env.CACHE, env);
        return new Response(JSON.stringify({
          ok: true,
          triggered: 'manual',
          kvNamespace: env.CACHE ? 'bound' : 'UNDEFINED',
          hasCache: !!env.CACHE,
          result,
        }), {
          status: 200,
          headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        logger.error('[EdgeProxy] Paper trading tick failed', { err });
        return new Response(JSON.stringify({ error: 'Tick failed', err: String(err) }), {
          status: 500,
          headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Webhooks ──
    if (path === '/api/webhooks/nowpayments' && request.method === 'POST') return handleNowPaymentsIPN(request, env, env.NOWPAYMENTS_IPN_SECRET);

    // ── Coupons ──
    if (path === '/api/coupons/validate' && request.method === 'POST') return handleValidateCoupon(request, env);
    if (path === '/api/coupons/apply' && request.method === 'POST') return handleApplyCoupon(request, env);
    if (path === '/api/coupons/redeem' && request.method === 'POST') return handleRedeemCoupon(request, env);
    if (path === '/api/coupons/activate' && request.method === 'POST') return handleActivateCoupon(request, env);

    // ── Version + Delivery ──
    if (path === '/api/version' && request.method === 'GET') return handleVersion(env);
    if (path === '/api/delivery/energy-9' && ['GET', 'POST'].includes(request.method)) return handleEnergy9Delivery(request, env);

    // ── Telegram + Copilot + Markets ──
    if (path === '/api/copilot/ask' && request.method === 'POST') return handleCopilotAsk(request, env);
    if (path === '/api/telegram/webhook' && request.method === 'POST') return handleTelegramWebhook(request, env);
    if (path === '/api/telegram/set-webhook' && request.method === 'POST') return handleSetTelegramWebhook(request, env);
    if (path === '/api/markets' && request.method === 'GET') return handleGetMarkets(request, env);

    // ── Sharding ──
    if (path === '/api/v1/shard/ring' && request.method === 'GET') return handleGetRing(request, env);
    if (path.match(/^\/api\/v1\/shard\/\d+\/health$/) && request.method === 'GET') return handleGetShardById(request, env);

    // ── Strategy execution (auth required) ──
    if (path === '/api/v1/strategies/execute' && request.method === 'POST') return handleExecuteStrategy(request, env);
    if (path === '/api/v1/strategies/list' && request.method === 'GET') return handleGetStrategiesList(request, env);

    // ── Settings save (KV) ──
    if (path.match(/^\/api\/tenants\/[^/]+\/config$/) && request.method === 'POST') {
      try {
        const body = await request.json();
        const tenantId = path.split('/')[3];
        await env.CACHE.put(`config:${tenantId}`, JSON.stringify(body));
        return new Response(JSON.stringify({ saved: true }), {
        headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      });
      } catch {
        return new Response(JSON.stringify({ error: 'Failed to save' }), {
        status: 500,
        headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
      });
      }
    }

    // ── Paper trades ledger (D1-backed, read-only) ──
    if (path === '/api/v1/paper-trades' && request.method === 'GET') {
      try {
        const db = env.SUBSCRIBERS;
        if (!db) {
          return new Response(JSON.stringify({ error: 'D1 not configured' }), {
            status: 500,
            headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
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
          status: 200,
          headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        logger.error('[EdgeProxy] paper-trades query failed', { err });
        return new Response(JSON.stringify({ error: 'Query failed' }), {
          status: 500,
          headers: { ...CORS, ...SECURITY_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── VPS fallback: 501 for unmigrated API routes (CF-only mode) ──
    if (env.VPS_ORIGIN && path.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Not implemented', message: 'VPS backend removed — endpoint not yet migrated to CF Worker' }),
        { status: 501, headers: { 'Content-Type': 'application/json', ...CORS, ...SECURITY_HEADERS } }
      );
    }

    // No VPS — return 501 for unhandled API routes
    if (path.startsWith('/api/')) return notImplementedResponse(path);

    // Non-API routes — 404
    return new Response('Not Found', { status: 404, headers: { ...CORS, ...SECURITY_HEADERS } });
  },

  /**
   * Cron trigger handler (CF Workers `scheduled` event).
   * CF Workers are stateless per invocation — setInterval does not survive
   * across cron trigger boundaries. Each scheduled tick runs one loop iteration,
   * loading state from KV before the tick and saving after.
   */
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    try {
      ensurePaperTrading(env.CACHE, env);
      await runPaperTradingTick(env.CACHE, env);
    } catch (err) {
      logger.error('[EdgeProxy] Paper trading tick failed', { err });
    }
  },
};
