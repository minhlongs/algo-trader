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

/** Auth env shape used by auth handlers (KV + JWT) */
interface AuthEnv {
  CACHE: import('@cloudflare/workers-types').KVNamespace;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
}

function asAuthEnv(env: Env): AuthEnv {
  return env as unknown as AuthEnv;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') return corsPreflightResponse();

    // ── Metrics (Prometheus) ──
    if (path === '/metrics' && request.method === 'GET') {
      const secret = env.METRIC_PASSWORD;
      if (secret) {
        if (url.searchParams.get('token') !== secret) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...CORS, 'Content-Type': 'application/json' },
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

    // ── Root — API info ──
    if (path === '/' && request.method === 'GET') {
      return new Response(JSON.stringify({
        service: 'algo-trader API', version: '1.0',
        status: 'ok', edge: 'cloudflare', environment: env.ENVIRONMENT,
        hasVps: !!env.VPS_ORIGIN, timestamp: new Date().toISOString(),
      }), { headers: CORS });
    }

    // ── Auth routes (KV-backed, always local) ──
    const auth = asAuthEnv(env);
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
        return new Response(JSON.stringify({ saved: true }), { headers: CORS });
      } catch {
        return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500, headers: CORS });
      }
    }

    // ── VPS fallback: 501 for unmigrated API routes (CF-only mode) ──
    if (env.VPS_ORIGIN && path.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Not implemented', message: 'VPS backend removed — endpoint not yet migrated to CF Worker' }),
        { status: 501, headers: { 'Content-Type': 'application/json', ...CORS } }
      );
    }

    // No VPS — return 501 for unhandled API routes
    if (path.startsWith('/api/')) return notImplementedResponse(path);

    // Non-API routes — 404
    return new Response('Not Found', { status: 404 });
  },
};
