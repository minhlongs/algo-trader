/**
 * Subscription service types, pricing, and shared HTTP helpers.
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface Env {
  CACHE: KVNamespace;
  SUBSCRIBERS?: D1Database;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  ENVIRONMENT?: string;
  VPS_ORIGIN?: string;
  REGION_ROUTING_ENABLED?: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  tier: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE' | 'MASTER';
  status: 'active' | 'canceled' | 'expired';
  amount_cents: number;
  currency: string;
  nowpayments_invoice_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export const PRICING: Record<string, { amount_cents: number }> = {
  FREE: { amount_cents: 0 },
  STARTER: { amount_cents: 4900 },
  PRO: { amount_cents: 9900 },
  ENTERPRISE: { amount_cents: 29900 },
  MASTER: { amount_cents: 99900 },
};

export function getTierPrice(tier: string): { amount_cents: number } | null {
  return PRICING[tier] ?? null;
}

export function getTierDisplayName(tier: string): string {
  const names: Record<string, string> = {
    FREE: 'Miễn phí',
    STARTER: 'Starter ($49/mo)',
    PRO: 'Pro ($99/mo)',
    ENTERPRISE: 'Enterprise ($299/mo)',
    MASTER: 'Master (Custom)',
  };
  return names[tier] ?? tier;
}

// CashClaw JWT: payload has {sub: email, tenantId: tenantId}
// Falls back to {id, email} or raw {email} if needed.
export function resolveUserFromRequest(request: Request, _env: Env): { id: string; email: string } | null {
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

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized — Bearer token required' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function freeFallback(): Response {
  return new Response(JSON.stringify({
    tier: 'FREE',
    status: 'active',
    amount_cents: 0,
    currency: 'usd',
    displayName: 'Miễn phí / Free',
  }), { headers: { 'Content-Type': 'application/json' } });
}

export function jsonHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || 'https://cashclaw.cc').split(',').map((s: string) => s.trim());
  const o = origin && allowed.includes(origin) ? origin : allowed[0];
  return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': o };
}
