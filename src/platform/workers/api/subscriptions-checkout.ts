/**
 * Subscription checkout helpers.
 *
 * A paid tier must never be granted at request time: the tier is activated by the
 * NOWPayments IPN once money has actually arrived. This module owns the decision of
 * which tiers can be self-serve, what they cost, and building the checkout invoice, so
 * `subscriptions-handlers.ts` stays on the HTTP layer and the rule is testable in one place.
 */

import type { Env } from './subscriptions-types';
import { createInvoice } from '../coupon-helpers';
import { getTierPrice } from './subscriptions-types';

/** Tiers a customer may buy through self-serve checkout. MASTER is quote-only. */
export const SELF_SERVE_TIERS: readonly string[] = ['PRO', 'ENTERPRISE'];

/** Tier that is always available and never requires an invoice. */
export const FREE_TIER = 'FREE';

export interface CheckoutResult {
  /** Checkout URL to redirect the customer to, or null when no invoice could be created. */
  checkoutUrl: string | null;
  tier: string;
  amountCents: number;
}

/** Whether this tier can be activated without a payment. */
export function isFreeTier(tier: string): boolean {
  return tier === FREE_TIER;
}

/** Whether this tier may be purchased through self-serve checkout. */
export function isSelfServeTier(tier: string): boolean {
  return SELF_SERVE_TIERS.includes(tier);
}

/**
 * Tiers that exist but cannot be bought online, because they are quoted rather than priced.
 * MASTER is advertised at a real price but is closed per-customer, not auto-charged.
 */
export const QUOTE_ONLY_TIERS: readonly string[] = ['MASTER', 'STARTER'];

/** Build a NOWPayments checkout for a paid tier. Never writes a subscription row. */
export async function createTierCheckout(
  env: Env,
  userEmail: string,
  tier: string,
): Promise<CheckoutResult | null> {
  const price = getTierPrice(tier);
  if (!price) return null;

  // No API key means no invoice can be created; grant nothing rather than the tier.
  if (!env.NOWPAYMENTS_API_KEY) return null;

  const orderId = `algo-trader_${userEmail}_${tier}_${Date.now()}`;
  const checkoutUrl = await createInvoice(
    env.NOWPAYMENTS_API_KEY,
    orderId,
    `algo-trader ${tier} subscription`,
    price.amount_cents / 100,
  );

  return { checkoutUrl, tier, amountCents: price.amount_cents };
}
