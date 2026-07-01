/**
 * Cloudflare Workers Edge Proxy + Standalone Auth
 * When VPS_ORIGIN is set: proxies to backend
 * When not set: handles auth + basic data locally via KV
 */

import { handleSignup, handleLogin, handleMe, handleListUsers, handleSetRole, handleDeleteUser, corsPreflightResponse, notImplementedResponse } from './auth-handlers';
import { handleListCoupons, handleValidateCoupon, handleActivateCoupon, handleApplyCoupon, seedCoupons } from './coupon-handlers';
import { handlePublicStats } from './stats-handler';
import { handleNowPaymentsIpn } from './webhook-handlers';

interface Env {
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  VPS_ORIGIN?: string;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  COMMIT_SHA?: string;
  DEPLOYED_AT?: string;
  DEPLOY_BRANCH?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
}

// Reserved: dynamic origin validation for multi-tenant CORS
function _getCorsOrigin(env: Env, origin?: string | null): string {
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  return origin && allowed.includes(origin) ? origin : allowed[0];
}
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://cashclaw.cc',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

const CACHE_TTL = 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') return corsPreflightResponse();

    // Health check — includes IPN metrics
    if (path === '/health' || path === '/api/health') {
      const [total, failed, lastSuccess, lastFailure] = await Promise.all([
        env.CACHE.get('metric:ipn-total'),
        env.CACHE.get('metric:ipn-failed'),
        env.CACHE.get('metric:ipn-last-success'),
        env.CACHE.get('metric:ipn-last-failure'),
      ]);
      return new Response(JSON.stringify({
        status: 'ok', edge: 'cloudflare', environment: env.ENVIRONMENT,
        hasVps: !!env.VPS_ORIGIN, timestamp: new Date().toISOString(),
        ipn: {
          total: parseInt(total || '0', 10) || 0,
          failed: parseInt(failed || '0', 10) || 0,
          lastSuccess: lastSuccess ? JSON.parse(lastSuccess) : null,
          lastFailure: lastFailure ? JSON.parse(lastFailure) : null,
        },
      }), { headers: CORS });
    }

    // Version — deploy verification (SHA injected via wrangler secrets)
    if (path === '/api/version') {
      const shortSha = (env.COMMIT_SHA || 'unknown').slice(0, 8);
      return new Response(JSON.stringify({
        shortSha,
        deployedAt: env.DEPLOYED_AT || null,
        deployBranch: env.DEPLOY_BRANCH || null,
        environment: env.ENVIRONMENT,
      }), { headers: CORS });
    }

    // Auth routes — always handled locally (KV-backed)
    if (path === '/api/auth/signup' && request.method === 'POST') return handleSignup(request, env);
    if (path === '/api/auth/login' && request.method === 'POST') return handleLogin(request, env);
    if (path === '/api/auth/me' && request.method === 'GET') return handleMe(request, env);
    if (path === '/api/auth/users' && request.method === 'GET') return handleListUsers(request, env);
    if (path === '/api/auth/role' && request.method === 'POST') return handleSetRole(request, env);
    if (path === '/api/auth/delete' && request.method === 'POST') return handleDeleteUser(request, env);

    // Markets placeholder
    if (path === '/api/markets' && request.method === 'GET') {
      return new Response(JSON.stringify({ markets: [] }), { headers: CORS });
    }

    // Settings save — store in KV
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

    // Seed default coupons on first access
    await seedCoupons(env);

    // Coupon routes — CF-native, no VPS needed
    if (path === '/api/coupons' && request.method === 'GET') return handleListCoupons(env);
    if (path === '/api/coupons/validate' && request.method === 'POST') return handleValidateCoupon(request, env);
    if (path === '/api/coupons/activate' && request.method === 'POST') return handleActivateCoupon(request, env);
    if (path === '/api/coupons/apply' && request.method === 'POST') return handleApplyCoupon(request, env);

    // Public stats — CF-native, no VPS needed
    if (path === '/api/public/stats' && request.method === 'GET') return handlePublicStats(env);

    // Webhook routes — CF-native, no VPS needed
    if (path === '/api/webhooks/nowpayments' && request.method === 'POST') return handleNowPaymentsIpn(request, env);

    // If VPS_ORIGIN is set, proxy remaining API requests
    if (env.VPS_ORIGIN && path.startsWith('/api/')) {
      // Webhook routes — no caching
      if (path.startsWith('/api/webhooks/')) return proxyToOrigin(request, env);

      // GET requests — cache at edge
      if (request.method === 'GET') {
        const cacheKey = `cache:${path}:${url.search}`;
        const cached = await env.CACHE.get(cacheKey);
        if (cached) {
          return new Response(cached, { headers: { ...CORS, 'X-Cache': 'HIT' } });
        }
        const response = await proxyToOrigin(request, env);
        if (response.ok) {
          const body = await response.text();
          await env.CACHE.put(cacheKey, body, { expirationTtl: CACHE_TTL });
          return new Response(body, { headers: { ...CORS, 'X-Cache': 'MISS' } });
        }
        return response;
      }

      return proxyToOrigin(request, env);
    }

    // No VPS — return 501 for unhandled API routes
    if (path.startsWith('/api/')) return notImplementedResponse(path);

    // Non-API routes — 404
    return new Response('Not Found', { status: 404 });
  },

  // ── Cron trigger: health self-check every 5 min ──
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const now = Date.now();
      const lastCheckStr = await env.CACHE.get('metric:cron-last-check');
      const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;

      const [total, failed, lastSuccess, lastFailure] = await Promise.all([
        env.CACHE.get('metric:ipn-total'),
        env.CACHE.get('metric:ipn-failed'),
        env.CACHE.get('metric:ipn-last-success'),
        env.CACHE.get('metric:ipn-last-failure'),
      ]);

      const checkEntry = {
        timestamp: new Date().toISOString(),
        ipnTotal: parseInt(total || '0', 10) || 0,
        ipnFailed: parseInt(failed || '0', 10) || 0,
        lastSuccess: lastSuccess ? JSON.parse(lastSuccess) : null,
        lastFailure: lastFailure ? JSON.parse(lastFailure) : null,
      };

      await env.CACHE.put('metric:cron-last-check', String(now));
      await env.CACHE.put('metric:cron-last-result', JSON.stringify(checkEntry));

      // Alert: new IPN failure since last check
      if (lastFailure) {
        const lf = JSON.parse(lastFailure) as { timestamp: string; payment_id: string };
        if (new Date(lf.timestamp).getTime() > lastCheck) {
          await env.CACHE.put(`alert:${now}`, JSON.stringify({
            type: 'ipn_failure',
            message: `IPN failure: payment ${lf.payment_id}`,
            paymentId: lf.payment_id,
            failureTime: lf.timestamp,
            detectedAt: new Date().toISOString(),
          }));
        }
      }

      // Warning: no IPN activity in 24h
      if (lastSuccess) {
        const ls = JSON.parse(lastSuccess) as { timestamp: string };
        if (now - new Date(ls.timestamp).getTime() > 86400000) {
          await env.CACHE.put(`alert:${now}-stale`, JSON.stringify({
            type: 'ipn_stale',
            message: 'No successful IPN in 24 hours',
            lastSuccess: ls,
            detectedAt: new Date().toISOString(),
          }));
        }
      }
    } catch {
      // Cron errors silent — avoid noise
    }
  },
};

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  const origin = env.VPS_ORIGIN!;
  const url = new URL(request.url);
  const target = new URL(origin);
  url.protocol = target.protocol;
  url.host = target.host;
  url.port = target.port;

  return fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
}
