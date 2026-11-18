/**
 * POLY-G5 Public Beta — Isolated Cloudflare Worker Entrypoint (`poly-beta-api`).
 */

import { APPROVED_PAPER_STRATEGIES, type PolyBetaEnv } from './poly-beta-types';
import {
  BETA_SECURITY_HEADERS,
  betaJsonResponse,
  buildCorsHeaders,
  checkRateLimit,
  isOriginPermitted,
} from './poly-beta-security';
import { resolveClientIpKey } from './poly-beta-request-guards';
import { detectForbiddenCallerAuthorityOverride } from './poly-beta-schemas';
import {
  authenticateBetaRequest,
  handleBetaLogin,
  handleBetaSignup,
} from './poly-beta-auth';
import {
  handleBetaDeleteAccount,
  handleBetaLogout,
  handleBetaSessionInfo,
} from './poly-beta-account';
import { fetchSupportedBetaMarkets } from './poly-beta-markets';
import { buildAuthoritativeDashboardView } from './poly-beta-dashboard-view';
import { dispatchAuthenticatedTenantMutation } from './poly-beta-mutations';

export { TenantPaperEngine } from './tenant-paper-engine-do';

const REAL_MONEY_BLOCKED_PATTERNS = [
  /^\/api\/beta\/(live|deposit|deposits|withdraw|withdrawals|approve|wallet|seed|private-key)/i,
  /^\/api\/webhooks\/nowpayments/i,
  /^\/api\/v1\/(subscriptions|live)/i,
];

async function routeBetaRequest(request: Request, env: PolyBetaEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      if (!isOriginPermitted(request.headers.get('Origin'), env)) {
        return new Response(null, { status: 403, headers: BETA_SECURITY_HEADERS });
      }
      return new Response(null, {
        status: 204,
        headers: { ...BETA_SECURITY_HEADERS, ...buildCorsHeaders(request, env) },
      });
    }

    if (String(env.LIVE_TRADING_ENABLED ?? 'false').toLowerCase() === 'true') {
      return betaJsonResponse(
        request,
        env,
        {
          error: 'Safety halt: poly-beta-api forbids LIVE_TRADING_ENABLED=true',
          code: 'LIVE_TRADING_FORBIDDEN_IN_BETA',
        },
        503,
      );
    }

    if (REAL_MONEY_BLOCKED_PATTERNS.some((re) => re.test(path))) {
      return betaJsonResponse(
        request,
        env,
        {
          error: 'Real-money, deposit, withdrawal, wallet signing, and live trading operations are strictly disabled in Public Beta.',
          code: 'REAL_MONEY_OPERATIONS_DISABLED',
          liveTradingEnabled: false,
        },
        403,
      );
    }

    if ((path === '/api/health' || path === '/health') && request.method === 'GET') {
      const feed = await fetchSupportedBetaMarkets(env);
      return betaJsonResponse(request, env, {
        ok: true,
        service: 'poly-beta-api',
        mode: 'PAPER_ONLY',
        liveTradingEnabled: false,
        g1SoakLocked: env.G1_SOAK_LOCK !== 'unlocked',
        g2PolyShadowLocked: env.G2_POLY_SHADOW_LOCK !== 'unlocked',
        commitSha: env.COMMIT_SHA ?? 'dev',
        marketFeedHealthy: feed.feedHealthy,
        supportedMarketCount: feed.markets.length,
        timestamp: new Date().toISOString(),
      });
    }

    if (path === '/api/beta/markets' && request.method === 'GET') {
      const rl = await checkRateLimit(env, `markets:${resolveClientIpKey(request, env)}`, 60, 60);
      if (!rl.allowed) {
        return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
      }
      const feed = await fetchSupportedBetaMarkets(env);
      return betaJsonResponse(request, env, {
        ok: true,
        mode: 'PAPER_ONLY',
        feedHealthy: feed.feedHealthy,
        staleReason: feed.staleReason,
        markets: feed.markets,
        strategies: APPROVED_PAPER_STRATEGIES,
      });
    }

    if (path === '/api/beta/auth/signup' && request.method === 'POST') return handleBetaSignup(request, env);
    if (path === '/api/beta/auth/login' && request.method === 'POST') return handleBetaLogin(request, env);

    if (path.startsWith('/api/beta/')) {
      const isMutating = request.method !== 'GET' && request.method !== 'HEAD';
      const auth = await authenticateBetaRequest(request, env, { requireCsrf: isMutating });
      if (!auth.ok) return auth.response;
      const { ctx } = auth;

      const queryOverride = detectForbiddenCallerAuthorityOverride(url, null);
      if (queryOverride) {
        return betaJsonResponse(request, env, { error: queryOverride, code: 'CALLER_SCOPE_FORBIDDEN' }, 403);
      }

      if (path === '/api/beta/auth/me' && request.method === 'GET') return handleBetaSessionInfo(request, env, ctx);
      if (path === '/api/beta/auth/logout' && request.method === 'POST') return handleBetaLogout(request, env, ctx);
      if (path === '/api/beta/account' && request.method === 'DELETE') {
        const rl = await checkRateLimit(env, `acct:${ctx.tenantId}`, 5, 60);
        if (!rl.allowed) {
          return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
        }
        return handleBetaDeleteAccount(request, env, ctx);
      }

      if (path === '/api/beta/portfolio' && request.method === 'GET') {
        const rl = await checkRateLimit(env, `pf:${ctx.tenantId}`, 90, 60);
        if (!rl.allowed) {
          return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
        }
        const feed = await fetchSupportedBetaMarkets(env);
        const view = await buildAuthoritativeDashboardView(
          env.POLY_BETA_DB,
          ctx.tenantId,
          feed.markets,
          feed.feedHealthy,
          feed.staleReason,
          Date.now(),
        );
        return betaJsonResponse(request, env, { ok: true, ...view, markets: feed.markets });
      }

      const mutated = await dispatchAuthenticatedTenantMutation(request, env, url, path, ctx);
      if (mutated) return mutated;
    }

    return betaJsonResponse(request, env, { error: 'Not Found', code: 'NOT_FOUND' }, 404);
}

export default {
  async fetch(request: Request, env: PolyBetaEnv): Promise<Response> {
    try {
      return await routeBetaRequest(request, env);
    } catch {
      return betaJsonResponse(request, env, { error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  },
};
