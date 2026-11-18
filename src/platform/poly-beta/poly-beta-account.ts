/**
 * POLY-G5 Public Beta — Session Status, Logout & Self-Service Account Deletion.
 *
 * Purges all tenant rows across `beta_sessions`, `beta_execution_logs`,
 * `beta_ledger_entries`, `beta_fills`, `beta_orders`, `beta_positions`,
 * `beta_portfolios`, `beta_users`, and stops/wipes the tenant's Durable Object.
 */

import type { AuthenticatedTenantContext, PolyBetaEnv } from './poly-beta-types';
import { betaJsonResponse, buildSessionClearCookie } from './poly-beta-security';
import { runAtomicBatch } from './poly-beta-ledger';

export function handleBetaSessionInfo(
  request: Request,
  env: PolyBetaEnv,
  ctx: AuthenticatedTenantContext,
): Response {
  return betaJsonResponse(request, env, {
    ok: true,
    authenticated: true,
    user: { email: ctx.email, tenantId: ctx.tenantId },
    csrfToken: ctx.csrfToken,
    mode: 'PAPER_ONLY',
    liveTradingEnabled: false,
  });
}

export async function handleBetaLogout(
  request: Request,
  env: PolyBetaEnv,
  ctx: AuthenticatedTenantContext,
): Promise<Response> {
  await env.POLY_BETA_DB.prepare(
    `DELETE FROM beta_sessions WHERE session_hash = ? AND tenant_id = ?`,
  )
    .bind(ctx.sessionHash, ctx.tenantId)
    .run();

  const isHttps = new URL(request.url).protocol === 'https:';
  return betaJsonResponse(
    request,
    env,
    { ok: true, loggedOut: true },
    200,
    { 'Set-Cookie': buildSessionClearCookie(isHttps) },
  );
}

export async function handleBetaDeleteAccount(
  request: Request,
  env: PolyBetaEnv,
  ctx: AuthenticatedTenantContext,
): Promise<Response> {
  // 1. Wipe Durable Object state & cancel any active alarm first
  const doId = env.TENANT_PAPER_ENGINE.idFromName(ctx.tenantId);
  const stub = env.TENANT_PAPER_ENGINE.get(doId);
  await stub.fetch('https://poly-beta.internal/purge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: ctx.tenantId }),
  });

  // 2. Delete every tenant-scoped record strictly bound to `ctx.tenantId`
  const tables = [
    'beta_sessions',
    'beta_execution_logs',
    'beta_ledger_entries',
    'beta_fills',
    'beta_orders',
    'beta_positions',
    'beta_portfolios',
    'beta_users',
  ] as const;

  await runAtomicBatch(
    env.POLY_BETA_DB,
    tables.map((table) =>
      env.POLY_BETA_DB.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`).bind(ctx.tenantId),
    ),
  );

  const isHttps = new URL(request.url).protocol === 'https:';
  return betaJsonResponse(
    request,
    env,
    { ok: true, deletedTenantId: ctx.tenantId },
    200,
    { 'Set-Cookie': buildSessionClearCookie(isHttps) },
  );
}
