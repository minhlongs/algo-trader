/**
 * POLY-G5 Public Beta — Request Authentication & CSRF Guard Middleware.
 */

import type { AuthenticatedTenantContext, PolyBetaEnv } from './poly-beta-types';
import {
  betaJsonResponse,
  extractSessionTokenFromCookie,
  sha256Hex,
  timingSafeHexEqual,
} from './poly-beta-security';
import { isMutationSourcePermitted } from './poly-beta-request-guards';

interface DbSessionJoinRow {
  session_hash: string;
  user_id: string;
  tenant_id: string;
  csrf_token: string;
  expires_at_ms: number;
  email: string;
}

export async function authenticateBetaRequest(
  request: Request,
  env: PolyBetaEnv,
  options: { requireCsrf: boolean; nowMs?: number },
): Promise<{ ok: true; ctx: AuthenticatedTenantContext } | { ok: false; response: Response }> {
  const nowMs = options.nowMs ?? Date.now();
  if (options.requireCsrf && !isMutationSourcePermitted(request, env)) {
    return {
      ok: false,
      response: betaJsonResponse(
        request,
        env,
        { error: 'Forbidden origin', code: 'CSRF_ORIGIN_DENIED' },
        403,
      ),
    };
  }

  const isHttps = new URL(request.url).protocol === 'https:';
  const rawSessionToken = extractSessionTokenFromCookie(request.headers.get('Cookie'), isHttps);
  if (!rawSessionToken) {
    return {
      ok: false,
      response: betaJsonResponse(
        request,
        env,
        { error: 'Authentication required', code: 'UNAUTHENTICATED' },
        401,
      ),
    };
  }

  const sessionHash = await sha256Hex(rawSessionToken);
  const row = await env.POLY_BETA_DB.prepare(
    `SELECT s.session_hash, s.user_id, s.tenant_id, s.csrf_token, s.expires_at_ms, u.email
     FROM beta_sessions s
     INNER JOIN beta_users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
     WHERE s.session_hash = ?`,
  )
    .bind(sessionHash)
    .first<DbSessionJoinRow>();

  if (!row || row.expires_at_ms <= nowMs) {
    if (row) {
      await env.POLY_BETA_DB.prepare(`DELETE FROM beta_sessions WHERE session_hash = ?`)
        .bind(sessionHash)
        .run();
    }
    return {
      ok: false,
      response: betaJsonResponse(
        request,
        env,
        { error: 'Session expired or invalid', code: 'SESSION_INVALID' },
        401,
      ),
    };
  }

  if (options.requireCsrf) {
    const csrfHeader = request.headers.get('X-CSRF-Token') || '';
    if (!timingSafeHexEqual(csrfHeader, row.csrf_token)) {
      return {
        ok: false,
        response: betaJsonResponse(
          request,
          env,
          { error: 'CSRF token invalid or missing', code: 'CSRF_TOKEN_INVALID' },
          403,
        ),
      };
    }
  }

  return {
    ok: true,
    ctx: {
      userId: row.user_id,
      tenantId: row.tenant_id,
      email: row.email,
      sessionHash: row.session_hash,
      csrfToken: row.csrf_token,
    },
  };
}
