/**
 * POLY-G5 Public Beta — Signup & Login Handlers.
 */

import { SESSION_TTL_MS, type PolyBetaEnv } from './poly-beta-types';
import {
  betaJsonResponse,
  buildSessionSetCookie,
  checkRateLimit,
  hashUserPassword,
  randomHexToken,
  sha256Hex,
  verifyUserPassword,
} from './poly-beta-security';
import {
  isMutationSourcePermitted,
  parseBoundedJsonBody,
  resolveVerifiedClientIpKey,
} from './poly-beta-request-guards';
import {
  betaLoginSchema,
  betaSignupSchema,
  detectForbiddenCallerAuthorityOverride,
} from './poly-beta-schemas';
import { provisionTenantGenesisLedger } from './poly-beta-genesis';
import { runAtomicBatch } from './poly-beta-ledger';
import { authorizeSignupEnrollmentAndInvite } from './poly-beta-signup-invite';

export { authenticateBetaRequest } from './poly-beta-session-guard';

const DUMMY_PASSWORD_SALT_HEX = 'a5'.repeat(16);
const DUMMY_PASSWORD_HASH_HEX = '5a'.repeat(32);

interface DbUserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  password_salt: string;
}

export async function handleBetaSignup(
  request: Request,
  env: PolyBetaEnv,
  nowMs = Date.now(),
): Promise<Response> {
  if (!isMutationSourcePermitted(request, env)) {
    return betaJsonResponse(request, env, { error: 'Forbidden origin', code: 'ORIGIN_DENIED' }, 403);
  }
  const clientIp = await resolveVerifiedClientIpKey(request, env, nowMs);
  const rl = await checkRateLimit(env, `signup:${clientIp}`, 10, 60, nowMs);
  if (!rl.allowed) {
    return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const bodyResult = await parseBoundedJsonBody(request, env);
  if (bodyResult instanceof Response) return bodyResult;
  const rawBody = bodyResult.body;

  const overrideErr = detectForbiddenCallerAuthorityOverride(new URL(request.url), rawBody);
  if (overrideErr) {
    return betaJsonResponse(request, env, { error: overrideErr, code: 'CALLER_SCOPE_FORBIDDEN' }, 403);
  }

  const parsed = betaSignupSchema.safeParse(rawBody);
  if (!parsed.success) {
    return betaJsonResponse(
      request,
      env,
      { error: parsed.error.issues[0]?.message ?? 'Invalid signup input', code: 'VALIDATION_ERROR' },
      400,
    );
  }

  const { email, password, inviteToken } = parsed.data;
  const gate = await authorizeSignupEnrollmentAndInvite(email, inviteToken, env, nowMs);
  if (!gate.ok) {
    return betaJsonResponse(request, env, { error: gate.error, code: gate.code }, gate.status);
  }

  const existing = await env.POLY_BETA_DB.prepare(`SELECT id FROM beta_users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    return betaJsonResponse(request, env, { error: 'Email already registered', code: 'EMAIL_EXISTS' }, 409);
  }

  const userId = `usr_${crypto.randomUUID()}`;
  const tenantId = `tn_${crypto.randomUUID()}`;
  const { hash, salt } = await hashUserPassword(password);
  const rawSession = randomHexToken(32);
  const sessionHash = await sha256Hex(rawSession);
  const csrfToken = randomHexToken(24);

  try {
    await provisionTenantGenesisLedger(env.POLY_BETA_DB, {
      userId,
      tenantId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      sessionHash,
      csrfToken,
      inviteTokenHash: gate.tokenHash,
      expiresAtMs: nowMs + SESSION_TTL_MS,
      nowMs,
    });
  } catch (err) {
    if (err instanceof Error && /unique|constraint/i.test(err.message)) {
      if (/beta_invite_redemptions|token_hash/i.test(err.message)) {
        return betaJsonResponse(
          request,
          env,
          { error: 'This single-use invite token has already been redeemed.', code: 'INVITE_TOKEN_REDEEMED' },
          403,
        );
      }
      return betaJsonResponse(request, env, { error: 'Email already registered', code: 'EMAIL_EXISTS' }, 409);
    }
    throw err;
  }

  const isHttps = new URL(request.url).protocol === 'https:';
  return betaJsonResponse(
    request,
    env,
    { ok: true, user: { email, tenantId }, csrfToken, mode: 'PAPER_ONLY', initialCapitalUsd: 100 },
    201,
    { 'Set-Cookie': buildSessionSetCookie(rawSession, isHttps) },
  );
}

export async function handleBetaLogin(
  request: Request,
  env: PolyBetaEnv,
  nowMs = Date.now(),
): Promise<Response> {
  if (!isMutationSourcePermitted(request, env)) {
    return betaJsonResponse(request, env, { error: 'Forbidden origin', code: 'ORIGIN_DENIED' }, 403);
  }
  const clientIp = await resolveVerifiedClientIpKey(request, env, nowMs);
  const rl = await checkRateLimit(env, `login:${clientIp}`, 12, 60, nowMs);
  if (!rl.allowed) {
    return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const bodyResult = await parseBoundedJsonBody(request, env);
  if (bodyResult instanceof Response) return bodyResult;
  const rawBody = bodyResult.body;

  const parsed = betaLoginSchema.safeParse(rawBody);
  if (!parsed.success) {
    return betaJsonResponse(request, env, { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, 401);
  }

  const user = await env.POLY_BETA_DB.prepare(
    `SELECT id, tenant_id, email, password_hash, password_salt FROM beta_users WHERE email = ?`,
  )
    .bind(parsed.data.email)
    .first<DbUserRow>();

  if (!user) {
    await verifyUserPassword(parsed.data.password, DUMMY_PASSWORD_HASH_HEX, DUMMY_PASSWORD_SALT_HEX);
    return betaJsonResponse(request, env, { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, 401);
  }
  if (!(await verifyUserPassword(parsed.data.password, user.password_hash, user.password_salt))) {
    return betaJsonResponse(request, env, { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }, 401);
  }

  const rawSession = randomHexToken(32);
  const sessionHash = await sha256Hex(rawSession);
  const csrfToken = randomHexToken(24);
  await runAtomicBatch(env.POLY_BETA_DB, [
    env.POLY_BETA_DB.prepare(
      `DELETE FROM beta_sessions WHERE tenant_id = ? AND expires_at_ms <= ?`,
    ).bind(user.tenant_id, nowMs),
    env.POLY_BETA_DB.prepare(
      `DELETE FROM beta_sessions
       WHERE tenant_id = ?
         AND session_hash NOT IN (
           SELECT session_hash FROM beta_sessions WHERE tenant_id = ? ORDER BY created_at_ms DESC LIMIT 9
         )`,
    ).bind(user.tenant_id, user.tenant_id),
    env.POLY_BETA_DB.prepare(
      `INSERT INTO beta_sessions (session_hash, user_id, tenant_id, csrf_token, expires_at_ms, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(sessionHash, user.id, user.tenant_id, csrfToken, nowMs + SESSION_TTL_MS, nowMs),
  ]);

  const isHttps = new URL(request.url).protocol === 'https:';
  return betaJsonResponse(
    request,
    env,
    { ok: true, user: { email: user.email, tenantId: user.tenant_id }, csrfToken, mode: 'PAPER_ONLY' },
    200,
    { 'Set-Cookie': buildSessionSetCookie(rawSession, isHttps) },
  );
}
