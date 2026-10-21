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
import { isSelfServeTier, isFreeTier, createTierCheckout } from './subscriptions-checkout';

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
    if (!newTier) {
      return new Response(JSON.stringify({ error: 'Invalid tier. Allowed: PRO, ENTERPRISE' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // A tier is granted only after NOWPayments confirms payment, so an upgrade request
    // produces a checkout URL — never an active subscription row.
    if (!isSelfServeTier(newTier)) {
      const reason = isFreeTier(newTier)
        ? 'FREE is the default tier and needs no upgrade.'
        : `${newTier} is quote-only, not self-serve. Contact sales to provision it.`;
      return new Response(JSON.stringify({ error: reason, tier: newTier }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const existing = await sub.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .bind(user.id, 'active').first<SubscriptionRow>();

    if (existing && existing.tier === newTier && !body.force) {
      return new Response(JSON.stringify({ error: `Already on ${newTier} tier` }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    }

    if (!env.NOWPAYMENTS_API_KEY) {
      logger.error('[subscriptions] cannot create checkout — NOWPAYMENTS_API_KEY unset', { userId: user.id, tier: newTier });
      return new Response(JSON.stringify({ error: 'Checkout unavailable: payment provider not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const checkout = await createTierCheckout(env, user.email, newTier);
    if (!checkout?.checkoutUrl) {
      return new Response(JSON.stringify({ error: 'Could not create checkout invoice' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    logger.info('[subscriptions] checkout created', { userId: user.id, tier: newTier, amountCents: checkout.amountCents });

    return new Response(JSON.stringify({
      tier: newTier, status: 'pending_payment',
      checkoutUrl: checkout.checkoutUrl,
      amount_cents: checkout.amountCents, currency: 'usd',
      displayName: getTierDisplayName(newTier),
    }), { status: 201, headers: jsonHeaders(env, request) });
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
    { tier: 'FREE', label: 'Miễn phí / Free', amount_cents: 0, currency: 'usd', selfServe: false, features: ['Basic scanning'] },
    { tier: 'STARTER', label: 'Starter — $49/mo', amount_cents: 4900, currency: 'usd', selfServe: false, features: ['AI Co-pilot access', 'Strategy marketplace'] },
    { tier: 'PRO', label: 'Pro — $99/mo', amount_cents: 9900, currency: 'usd', selfServe: true, features: ['Full Co-pilot', 'Telegram /ask', 'All 5 intents'] },
    { tier: 'ENTERPRISE', label: 'Enterprise — $299/mo', amount_cents: 29900, currency: 'usd', selfServe: true, features: ['Custom strategies', 'Dedicated infra', '12 shards'] },
    { tier: 'MASTER', label: 'Master — $999/mo', amount_cents: 99900, currency: 'usd', selfServe: false, features: ['White-label', 'Private marketplace', 'Direct support'] },
  ];
  return new Response(JSON.stringify({ tiers }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
