/**
 * Signals Channel Price Book
 *
 * The signals channel sells its own paid delivery tiers ($29 / $99 / $299), which do NOT
 * exist in the platform price book `PRICING_TIERS` (0 / 49 / 99 / 299 / 999). Two of those
 * numbers — 99 and 299 — collide with real platform tier prices, so a single shared
 * amount→tier map would silently route a signals buyer into a platform tier (and vice
 * versa). The two channels are therefore priced in separate, explicitly declared tables
 * that both sit next to each other here.
 *
 * `PRICING_TIERS` remains the source of truth for **platform** license tiers. This table
 * is the source of truth for **signals** delivery tiers. Neither is derived from the
 * other, and a raw amount literal typed inline in a webhook handler is never a price
 * book at all — it silently stops granting a tier the moment a price changes.
 */

import type { TierKey } from '../../desk/signal/signal-types';

/** One sold signals product: the USD price and the delivery tier it grants. */
export interface SignalsPriceBookEntry {
  /** USD price charged by NOWPayments. */
  readonly priceUsd: number;
  /** Delivery tier granted when this price settles. */
  readonly tier: TierKey;
  /** Human-readable plan name, used for audit and invoice text. */
  readonly name: string;
}

/**
 * The complete signals price book. Every paid signals product the platform sells is
 * declared here exactly once.
 *
 * Delivery tiers deliberately keep `BASIC`: `FREE` is the unsubscribed state in the
 * signals vocabulary, so a paid Basic buy must not collapse into it — otherwise a
 * paying customer is indistinguishable from one who never bought.
 */
export const SIGNALS_PRICE_BOOK: Readonly<Record<string, SignalsPriceBookEntry>> = Object.freeze({
  SIGNALS_BASIC: { priceUsd: 29, tier: 'BASIC', name: 'Signals Basic' },
  SIGNALS_PRO: { priceUsd: 99, tier: 'PRO', name: 'Signals Pro' },
  SIGNALS_ENTERPRISE: { priceUsd: 299, tier: 'ENTERPRISE', name: 'Signals Enterprise' },
});

/**
 * Raised when a settled payment does not map to any signals price-book entry.
 *
 * This is the fail-closed signal: the caller must NOT grant a tier, must NOT guess, and
 * must surface an operator-visible error rather than defaulting to a tier the customer
 * never paid for. The founder's binding decision across this repo is that a tier which
 * cannot be resolved from the price book is an error, never a silent fallback.
 */
export class SignalsPriceNotFoundError extends Error {
  readonly paidAmountUsd: number;

  constructor(paidAmountUsd: number) {
    super(
      `No signals price-book entry matches paid amount $${paidAmountUsd}; refusing to grant a tier ` +
        'without a verified price-book match',
    );
    this.name = 'SignalsPriceNotFoundError';
    this.paidAmountUsd = paidAmountUsd;
  }
}

/** Every declared signals price, ascending. Used for stable diagnostics. */
export function listSignalsPrices(): readonly number[] {
  return Object.values(SIGNALS_PRICE_BOOK)
    .map((entry) => entry.priceUsd)
    .sort((a, b) => a - b);
}

/**
 * Resolve the delivery tier for a settled USD amount, or throw when no entry matches.
 *
 * Throws `SignalsPriceNotFoundError` rather than returning null/garbage so that a
 * mispriced or tampered payment cannot activate anything: an amount that is not on the
 * price book is not a discount, it is an unknown.
 */
export function resolveSignalsTierForAmount(
  paidAmountUsd: number,
): SignalsPriceBookEntry {
  if (!Number.isFinite(paidAmountUsd)) {
    throw new SignalsPriceNotFoundError(paidAmountUsd);
  }

  for (const entry of Object.values(SIGNALS_PRICE_BOOK)) {
    if (entry.priceUsd === paidAmountUsd) return entry;
  }

  throw new SignalsPriceNotFoundError(paidAmountUsd);
}
