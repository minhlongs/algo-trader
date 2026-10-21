/**
 * Shared fixtures for the billing price-consistency tests.
 *
 * The expected prices are declared locally on purpose: if a price genuinely
 * changes, this table must be edited too, which forces a deliberate decision
 * instead of a test silently agreeing with whatever the code happens to say.
 */

import { LicenseTier } from '../../../src/shared/types/license';
import { NOWPAYMENTS_TIERS } from '../../../src/platform/billing/nowpayments-types';

/** Intended platform prices in USD/month. */
export const EXPECTED_PLATFORM_PRICES: Record<string, number> = {
  FREE: 0, STARTER: 49, PRO: 99, ENTERPRISE: 299, MASTER: 999,
};

/** Intended signals-product prices in USD/month. */
export const EXPECTED_SIGNALS_PRICES: Record<string, number> = {
  SIGNALS_BASIC: 29, SIGNALS_PRO: 99, SIGNALS_ENTERPRISE: 299,
};

/** Tiers that may legitimately carry no self-serve price. */
export const NON_PRICED_KEYS: ReadonlySet<string> = new Set(['FREE', 'MASTER']);

/** Tier keys the LicenseTier vocabulary and the feature gate accept. */
export const KNOWN_TIER_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(LicenseTier),
  ...Object.keys(EXPECTED_SIGNALS_PRICES),
]);

export const KNOWN_KEYS_LIST = [...KNOWN_TIER_KEYS].join(', ');

/** The row shape `/api/v1/subscriptions/tiers` serves. */
export interface ServedTier {
  tier: string;
  label: string;
  amount_cents: number;
  currency: string;
  selfServe?: boolean;
  features: string[];
}

/** Escape a literal for safe interpolation into a RegExp source. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a customer-facing heading to the tier key it names, so the invariant
 * can be asserted against a key rather than a display string. Matching is exact
 * on purpose: `BASIC` must not resolve to `SIGNALS_BASIC` by substring luck —
 * that is precisely the ambiguity that hid the original defect.
 */
export function headingToTierKey(heading: string): string | null {
  const direct = heading.toUpperCase();
  if (KNOWN_TIER_KEYS.has(direct)) return direct;

  for (const [key, tier] of Object.entries(NOWPAYMENTS_TIERS)) {
    if (heading === tier.name.toLowerCase()) return key;
  }
  return null;
}

/**
 * Every tier name this formatter advertises, read from the numbered, bolded list
 * items its tier blocks are built from (`*1. Signals Basic*`), normalised so a
 * renamed or invented tier reaches the assertion instead of being unrecognised.
 */
export function advertisedTierHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const [, segment] of text.matchAll(/\*(\d+\.[^*]+)\*/g)) {
    headings.push(segment.replace(/^\d+\.\s*/, '').trim().toLowerCase());
  }
  return headings;
}
