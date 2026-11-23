/**
 * Public Beta — Authenticated Tenant In-App Feedback Handlers.
 *
 * Enforces strict Zod validation, XSS/script content rejection, server-derived
 * tenant/user authority, per-tenant rate limiting, and tenant-scoped queries.
 */

import { z } from 'zod';
import type { AuthenticatedTenantContext, PolyBetaEnv } from './poly-beta-types';
import { betaJsonResponse, checkRateLimit } from './poly-beta-security';
import { parseBoundedJsonBody } from './poly-beta-request-guards';
import { detectForbiddenCallerAuthorityOverride } from './poly-beta-schemas';

export const betaFeedbackCreateSchema = z
  .object({
    category: z.enum([
      'bug',
      'confusing_workflow',
      'trading_simulation',
      'feature_suggestion',
      'other',
    ]),
    message: z.string().trim().min(5).max(1500),
    screenId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._:/-]+$/, 'Invalid screenId format')
      .optional(),
  })
  .strict();

const UNSAFE_HTML_OR_SCRIPT_PATTERN =
  /<\s*script\b|<\s*\/|javascript\s*:|\bon[a-z]+\s*=|<\s*[a-z!/?][^>]*>/i;

function sanitizeFeedbackMessage(raw: string): { ok: true; value: string } | { ok: false } {
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (cleaned.length < 5 || UNSAFE_HTML_OR_SCRIPT_PATTERN.test(cleaned)) {
    return { ok: false };
  }
  const escaped = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return { ok: true, value: escaped };
}

interface BetaFeedbackRow {
  feedback_id: string;
  category: string;
  message: string;
  screen_id: string | null;
  app_version: string;
  status: string;
  created_at_ms: number;
}

export async function handleBetaCreateFeedback(
  request: Request,
  env: PolyBetaEnv,
  url: URL,
  ctx: AuthenticatedTenantContext,
): Promise<Response> {
  const rl = await checkRateLimit(env, `fb:${ctx.tenantId}`, 10, 3600);
  if (!rl.allowed) {
    return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const bodyResult = await parseBoundedJsonBody(request, env);
  if (bodyResult instanceof Response) return bodyResult;
  const raw = bodyResult.body;

  const bodyOverride = detectForbiddenCallerAuthorityOverride(url, raw);
  if (bodyOverride) {
    return betaJsonResponse(request, env, { error: bodyOverride, code: 'CALLER_SCOPE_FORBIDDEN' }, 403);
  }

  const parsed = betaFeedbackCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return betaJsonResponse(
      request,
      env,
      { error: parsed.error.issues[0]?.message ?? 'Invalid feedback input', code: 'VALIDATION_ERROR' },
      400,
    );
  }

  const sanitized = sanitizeFeedbackMessage(parsed.data.message);
  if (!sanitized.ok) {
    return betaJsonResponse(
      request,
      env,
      { error: 'Feedback message contains disallowed HTML or script content', code: 'INVALID_FEEDBACK_CONTENT' },
      400,
    );
  }

  const feedbackId = `fb_${crypto.randomUUID()}`;
  const createdAtMs = Date.now();
  const screenId = parsed.data.screenId ?? null;
  const appVersion = env.COMMIT_SHA ?? 'dev';

  await env.POLY_BETA_DB.prepare(
    `INSERT INTO beta_feedback (feedback_id, tenant_id, user_id, category, message, screen_id, app_version, status, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?)`,
  )
    .bind(
      feedbackId,
      ctx.tenantId,
      ctx.userId,
      parsed.data.category,
      sanitized.value,
      screenId,
      appVersion,
      createdAtMs,
    )
    .run();

  return betaJsonResponse(
    request,
    env,
    {
      ok: true,
      feedback: {
        feedbackId,
        category: parsed.data.category,
        message: sanitized.value,
        screenId,
        status: 'NEW',
        createdAtMs,
      },
    },
    201,
  );
}

export async function handleBetaListFeedback(
  request: Request,
  env: PolyBetaEnv,
  ctx: AuthenticatedTenantContext,
): Promise<Response> {
  const rl = await checkRateLimit(env, `fb-list:${ctx.tenantId}`, 60, 60);
  if (!rl.allowed) {
    return betaJsonResponse(request, env, { error: 'Rate limit exceeded', code: 'RATE_LIMITED' }, 429);
  }

  const res = await env.POLY_BETA_DB.prepare(
    `SELECT feedback_id, category, message, screen_id, app_version, status, created_at_ms
     FROM beta_feedback WHERE tenant_id = ? ORDER BY created_at_ms DESC LIMIT 20`,
  )
    .bind(ctx.tenantId)
    .all<BetaFeedbackRow>();

  return betaJsonResponse(request, env, {
    ok: true,
    feedback: (res.results ?? []).map((row) => ({
      feedbackId: row.feedback_id,
      category: row.category,
      message: row.message,
      screenId: row.screen_id,
      appVersion: row.app_version,
      status: row.status,
      createdAtMs: row.created_at_ms,
    })),
  });
}
