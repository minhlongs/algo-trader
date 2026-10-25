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
import { PRICING_TIERS } from '../../billing/pricing-tiers';

/**
 * Ordered tier keys as they are advertised to customers. The order is part of the
 * response contract: the UI renders this array top-to-bottom as the pricing table.
 */
const TIER_ORDER = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER'] as const;

/**
 * Marketing copy for each tier. `PRICING_TIERS[tier].features` holds capability slugs
 * ('ml-models', 'premium-data') for entitlement checks — a different vocabulary from
 * the customer-facing sentences this endpoint has always returned. Swapping one for
 * the other would silently change what customers read, so the presentation copy stays
 * here while prices come from the price book.
 */
const TIER_MARKETING_COPY: Record<string, string[]> = {
  FREE: ['Basic scanning'],
  STARTER: ['AI Co-pilot access', 'Strategy marketplace'],
  PRO: ['Full Co-pilot', 'Telegram /ask', 'All 5 intents'],
  ENTERPRISE: ['Custom strategies', 'Dedicated infra', '12 shards'],
  MASTER: ['White-label', 'Private marketplace', 'Direct support'],
};

/**
 * Build the advertised label for a tier from its own price, so the number in the label
 * and the number in `amount_cents` cannot disagree. A zero price reads as free; every
 * other tier reads as "$<dollars>/mo". Returns just the tier name if the price is missing.
 */
function buildTierLabel(tier: string, price: { amount_cents: number } | null): string {
  const pricingTier = PRICING_TIERS[tier];
  const name = pricingTier?.name ?? tier;
  if (!price) return name;
  if (price.amount_cents === 0) return 'Miễn phí / Free';
  return `${name} — $${price.amount_cents / 100}/mo`;
}

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
  // The price comes from the same price book the checkout charges from
  // (`getTierPrice` -> `PRICING` in cents), so a displayed price can never drift from
  // the amount a customer is actually invoiced. The label is derived from that same
  // number rather than typed by hand, so editing a price cannot leave a stale
  // "Pro — $99/mo" label behind.
  const tiers = TIER_ORDER.map((tier) => {
    const price = getTierPrice(tier);
    const pricingTier = PRICING_TIERS[tier];
    return {
      tier,
      label: buildTierLabel(tier, price),
      amount_cents: price?.amount_cents ?? 0,
      currency: 'usd',
      selfServe: isSelfServeTier(tier),
      features: TIER_MARKETING_COPY[tier] ?? pricingTier?.features ?? [],
    };
  });
  return new Response(JSON.stringify({ tiers }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
