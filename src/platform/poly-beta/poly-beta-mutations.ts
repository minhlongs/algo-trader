/**
 * POLY-G5 Public Beta — Authenticated Tenant Mutation Router (DO Bridge).
 */

import type { AuthenticatedTenantContext, PolyBetaEnv } from './poly-beta-types';
import { betaJsonResponse, checkRateLimit } from './poly-beta-security';
import { parseBoundedJsonBody } from './poly-beta-request-guards';
import {
  betaPaperOrderSchema,
  betaSettlePositionSchema,
  betaStrategyControlSchema,
  detectForbiddenCallerAuthorityOverride,
} from './poly-beta-schemas';

export async function dispatchAuthenticatedTenantMutation(
  request: Request,
  env: PolyBetaEnv,
  url: URL,
  path: string,
  ctx: AuthenticatedTenantContext,
): Promise<Response | null> {
  const rl = await checkRateLimit(env, `mut:${ctx.tenantId}`, 30, 60);
  if (!rl.allowed) {
    return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  // Parse JSON body once, only for routes that consume one (cancel has no body)
  const needsBody = path === '/api/beta/strategy/control' || path === '/api/beta/orders' || path === '/api/beta/positions/settle';
  let raw: unknown = null;
  if (needsBody) {
    const bodyResult = await parseBoundedJsonBody(request, env);
    if (bodyResult instanceof Response) return bodyResult;
    raw = bodyResult.body;
  }

  const doStub = env.TENANT_PAPER_ENGINE.get(env.TENANT_PAPER_ENGINE.idFromName(ctx.tenantId));

  if (path === '/api/beta/strategy/control' && request.method === 'POST') {
    const bodyOverride = detectForbiddenCallerAuthorityOverride(url, raw);
    if (bodyOverride) {
      return betaJsonResponse(request, env, { error: bodyOverride, code: 'CALLER_SCOPE_FORBIDDEN' }, 403);
    }
    const parsed = betaStrategyControlSchema.safeParse(raw);
    if (!parsed.success) {
      return betaJsonResponse(
        request,
        env,
        { error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const doRes = await doStub.fetch('https://poly-beta.internal/control', {
      method: 'POST',
      body: JSON.stringify({ ...parsed.data, tenantId: ctx.tenantId }),
    });
    return betaJsonResponse(request, env, await doRes.json(), doRes.status);
  }

  if (path === '/api/beta/orders' && request.method === 'POST') {
    const bodyOverride = detectForbiddenCallerAuthorityOverride(url, raw);
    if (bodyOverride) {
      return betaJsonResponse(request, env, { error: bodyOverride, code: 'CALLER_SCOPE_FORBIDDEN' }, 403);
    }
    const parsed = betaPaperOrderSchema.safeParse(raw);
    if (!parsed.success) {
      return betaJsonResponse(
        request,
        env,
        { error: parsed.error.issues[0]?.message ?? 'Invalid order', code: 'VALIDATION_ERROR' },
        400,
      );
    }
    const doRes = await doStub.fetch('https://poly-beta.internal/order', {
      method: 'POST',
      body: JSON.stringify({ ...parsed.data, tenantId: ctx.tenantId }),
    });
    return betaJsonResponse(request, env, await doRes.json(), doRes.status);
  }

  const cancelMatch = path.match(/^\/api\/beta\/orders\/([A-Za-z0-9_-]{1,80})\/cancel$/);
  if (cancelMatch && request.method === 'POST') {
    const doRes = await doStub.fetch('https://poly-beta.internal/cancel-order', {
      method: 'POST',
      body: JSON.stringify({ tenantId: ctx.tenantId, orderId: cancelMatch[1] }),
    });
    return betaJsonResponse(request, env, await doRes.json(), doRes.status);
  }

  if (path === '/api/beta/positions/settle' && request.method === 'POST') {
    const bodyOverride = detectForbiddenCallerAuthorityOverride(url, raw);
    if (bodyOverride) {
      return betaJsonResponse(request, env, { error: bodyOverride, code: 'CALLER_SCOPE_FORBIDDEN' }, 403);
    }
    const parsed = betaSettlePositionSchema.safeParse(raw);
    if (!parsed.success) {
      return betaJsonResponse(request, env, { error: 'Invalid settlement input', code: 'VALIDATION_ERROR' }, 400);
    }
    const doRes = await doStub.fetch('https://poly-beta.internal/settle', {
      method: 'POST',
      body: JSON.stringify({ ...parsed.data, tenantId: ctx.tenantId }),
    });
    return betaJsonResponse(request, env, await doRes.json(), doRes.status);
  }

  return null;
}
