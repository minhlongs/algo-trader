/**
 * Subscription HTTP handlers for Cloudflare Workers edge proxy.
 */

import { logger } from '../../../shared/utils/logger';
import type { Env, SubscriptionRow } from './subscriptions-types';
import {
  getTierPrice,
  getTierDisplayName,
  resolveUserFromRequest,
  unauthorized,
  freeFallback,
  jsonHeaders,
} from './subscriptions-types';

export async function handleGetMySubscription(request: Request, env: Env): Promise<Response> {
  const sub = env.SUBSCRIBERS;
  if (!sub) {
    return new Response(JSON.stringify({
      tier: 'FREE',
      status: 'active',
      amount_cents: 0,
      currency: 'usd',
      message: 'D1 not bound yet — returning FREE tier fallback',
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const user = resolveUserFromRequest(request, env);
  if (!user) return unauthorized();

  try {
    const result = await sub.prepare(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    ).bind(user.id).first<SubscriptionRow>();

    if (!result) return freeFallback();

    return new Response(JSON.stringify({
      id: result.id,
      tier: result.tier,
      status: result.status,
      amount_cents: result.amount_cents,
      currency: result.currency,
      nowpayments_invoice_id: result.nowpayments_invoice_id,
      current_period_start: result.current_period_start,
      current_period_end: result.current_period_end,
      displayName: getTierDisplayName(result.tier),
    }), { headers: jsonHeaders(env, request) });
  } catch (err) {
    logger.error('[subscriptions] get my error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleUpgrade(request: Request, env: Env): Promise<Response> {
  const sub = env.SUBSCRIBERS;
  if (!sub) return new Response(JSON.stringify({ error: 'D1 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  const user = resolveUserFromRequest(request, env);
  if (!user) return unauthorized();

  try {
    const body = (await request.json()) as { tier: string; force?: boolean };
    const newTier = body.tier?.toUpperCase();
    if (!newTier || !['STARTER', 'PRO', 'ENTERPRISE', 'MASTER'].includes(newTier)) {
      return new Response(JSON.stringify({ error: 'Invalid tier. Allowed: STARTER, PRO, ENTERPRISE, MASTER' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const price = getTierPrice(newTier);
    if (!price) return new Response(JSON.stringify({ error: `No price configured for ${newTier}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    const existing = await sub.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .bind(user.id, 'active').first<SubscriptionRow>();

    if (existing && existing.tier === newTier && !body.force) {
      return new Response(JSON.stringify({ error: `Already on ${newTier} tier` }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID?.() ?? `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const periodStart = now;
    const periodEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    await sub.prepare(
      `INSERT INTO subscriptions (id, user_id, tier, status, amount_cents, currency, nowpayments_invoice_id, current_period_start, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(id, user.id, newTier, 'active', price.amount_cents, 'usd', periodStart, periodEnd, now).run();

    await env.CACHE.put(`tier:${user.id}`, newTier, { expirationTtl: 300 });

    logger.info('[subscriptions] upgraded', { userId: user.id, tier: newTier, amountCents: price.amount_cents });

    return new Response(JSON.stringify({
      id, tier: newTier, status: 'active',
      amount_cents: price.amount_cents, currency: 'usd',
      current_period_start: periodStart, current_period_end: periodEnd,
      displayName: getTierDisplayName(newTier),
    }), { headers: jsonHeaders(env, request) });
  } catch (err) {
    logger.error('[subscriptions] upgrade error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleCancel(request: Request, env: Env): Promise<Response> {
  const sub = env.SUBSCRIBERS;
  if (!sub) return new Response(JSON.stringify({ error: 'D1 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  const user = resolveUserFromRequest(request, env);
  if (!user) return unauthorized();

  try {
    const existing = await sub.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .bind(user.id, 'active').first<SubscriptionRow>();

    if (!existing) return new Response(JSON.stringify({ error: 'No active subscription' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const now = new Date().toISOString();
    await sub.prepare('UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?')
      .bind('canceled', now, existing.id).run();

    await env.CACHE.put(`tier:${user.id}`, 'FREE', { expirationTtl: 300 });

    logger.info('[subscriptions] canceled', { userId: user.id, subId: existing.id });
    return new Response(JSON.stringify({ id: existing.id, status: 'canceled' }), { headers: jsonHeaders(env, request) });
  } catch (err) {
    logger.error('[subscriptions] cancel error', { error: String(err) });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function handleGetTiers(): Promise<Response> {
  const tiers = [
    { tier: 'FREE', label: 'Miễn phí / Free', amount_cents: 0, currency: 'usd', features: ['Basic scanning'] },
    { tier: 'STARTER', label: 'Starter ($49/mo)', amount_cents: 4900, currency: 'usd', features: ['AI Co-pilot access', 'Strategy marketplace'] },
    { tier: 'PRO', label: 'Pro ($99/mo)', amount_cents: 9900, currency: 'usd', features: ['Full Co-pilot', 'Telegram /ask', 'All 5 intents'] },
    { tier: 'ENTERPRISE', label: 'Enterprise ($299/mo)', amount_cents: 29900, currency: 'usd', features: ['Custom strategies', 'Dedicated infra', '12 shards'] },
    { tier: 'MASTER', label: 'Master (Custom)', amount_cents: 99900, currency: 'usd', features: ['White-label', 'Private marketplace', 'Direct support'] },
  ];
  return new Response(JSON.stringify({ tiers }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
