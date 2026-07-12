/**
 * Energy 9 Solution — delivery endpoint.
 *
 * POST /api/delivery/energy-9
 * Auth: Bearer JWT (CashClaw format: {sub: email, tenantId})
 * Tier gate: BASIC+ required
 *
 * Phase 01 (E1): Returns 200 with delivery confirmation payload.
 * E2-E4 (post-delivery): onboard guide, invoice, support path.
 *
 * Reuses resolveUserFromRequest + tier lookup from subscriptions.ts.
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { logger } from '../../../desk/utils/logger';

type Env = { CACHE: KVNamespace; SUBSCRIBERS?: D1Database; JWT_SECRET?: string; ALLOWED_ORIGINS?: string; NOWPAYMENTS_IPN_SECRET?: string; ENVIRONMENT?: string; VPS_ORIGIN?: string; REGION_ROUTING_ENABLED?: string; };

// Reuse user resolution from subscriptions.ts
function resolveUserFromRequest(request: Request, _env: Env): { id: string; email: string } | null {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const raw = JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
    const email = (raw.sub as string | undefined) || (raw.email as string | undefined) || '';
    const tenantId = (raw.tenantId as string | undefined);
    const id = tenantId || email;
    if (id) return { id, email };
    return null;
  } catch {
    return null;
  }
}

type TierKey = 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'MASTER';

async function getUserTier(userId: string, env: Env): Promise<TierKey> {
  // Check KV cache first (set by subscription upgrade handler)
  const cached = await env.CACHE?.get(`tier:${userId}`);
  if (cached && ['FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER'].includes(cached)) {
    return cached as TierKey;
  }

  // Fallback: D1 lookup
  const db = env.SUBSCRIBERS as D1Database | undefined;
  if (!db) return 'FREE';

  try {
    const row = await db
      .prepare('SELECT tier FROM subscriptions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .bind(userId, 'active')
      .first<{ tier: string }>();
    if (row?.tier) return row.tier as TierKey;
  } catch (err) {
    logger.error('[energy-9] tier lookup error', { error: String(err) });
  }
  return 'FREE';
}

const BASIC_TIERS: TierKey[] = ['STARTER', 'PRO', 'ENTERPRISE', 'MASTER'];

function jsonResponse(body: unknown, status = 200, env: Env, request: Request): Response {
  const origin = request.headers.get('Origin');
  const allowed = ((env as any).ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': o },
  });
}

export async function handleEnergy9Delivery(request: Request, env: Env): Promise<Response> {
  // 1. Auth check
  const user = resolveUserFromRequest(request, env);
  if (!user) {
    return jsonResponse({ error: 'Unauthorized — Bearer token required' }, 401, env, request);
  }

  // 2. Tier gate: BASIC+ required
  const tier = await getUserTier(user.id, env);
  if (!BASIC_TIERS.includes(tier)) {
    logger.warn('[energy-9] tier-gated', { userId: user.id, tier });
    return jsonResponse({
      error: 'Upgrade required',
      code: 'TIER_GATED',
      requiredTier: 'BASIC',
      currentTier: tier,
      upgradeUrl: 'https://cashclaw.cc/pricing',
    }, 403, env, request);
  }

  // 3. Parse optional body (delivery preferences)
  let preferences: Record<string, unknown> = {};
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && 'preferences' in body) {
      preferences = (body as Record<string, unknown>).preferences as Record<string, unknown>;
    }
  } catch {
    // No body — deliver default configuration
  }

  // 4. Delivery confirmation
  const deliveryId = `del_${Date.now()}_${crypto.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`;
  const deliveredAt = new Date().toISOString();

  // Store delivery record in KV for reference
  if (env.CACHE) {
    try {
      await env.CACHE.put(
        `delivery:${deliveryId}`,
        JSON.stringify({ userId: user.id, tier, deliveredAt, preferences }),
        { expirationTtl: 86400 * 90 } // 90-day retention
      );
    } catch (err) {
      logger.error('[energy-9] KV write failed', { error: String(err) });
    }
  }

  logger.info('[energy-9] delivered', { userId: user.id, tier, deliveryId });

  // Phase 01 E1: HTTP 200 with delivery confirmation payload
  return jsonResponse({
    success: true,
    deliveryId,
    solution: 'Energy 9',
    tier,
    deliveredAt,
    // E2: onboarding guide reference
    onboardingGuide: `/docs/energy-9-onboarding`,
    // E3: invoice reference (populated by NOWPayments IPN handler)
    invoiceId: null,
    // E4: support escalation
    support: {
      email: 'support@cashclaw.cc',
      telegramBot: '@CashClawSupport',
      slaHours: 24,
    },
    nextSteps: [
      'Read the onboarding guide at /docs/energy-9-onboarding',
      'Connect Polymarket API key in dashboard Settings → API Keys',
      'Set profit threshold in Settings → Risk',
    ],
  }, 200, env, request);
}
