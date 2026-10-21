/**
 * Cross-source price consistency — the repo's billing price tables must agree,
 * and every tier key a customer can reach must resolve to a canonical price.
 *
 * The repo carries two product lines, not contradictory tables:
 *   platform — Free $0, Starter $49, Pro $99, Enterprise $299, Master $999
 *   signals  — Signals Basic $29, Signals Pro $99, Signals Enterprise $299
 * This test pins both lines to their canonical source so future drift fails
 * loudly here instead of silently diverging across the API and the gateway.
 */

import { describe, it, expect } from 'vitest';
import { PRICING_TIERS } from '../../src/platform/billing/pricing-tiers';
import { PRICING, getTierPrice } from '../../src/platform/workers/api/subscriptions-types';
import { NOWPAYMENTS_TIERS } from '../../src/platform/billing/nowpayments-types';
import { ENTERPRISE_ACV, type EnterpriseTier } from '../../src/platform/billing/enterprise-inquiry-store';
import { LicenseTier } from '../../src/shared/types/license';
import { handleGetTiers } from '../../src/platform/workers/api/subscriptions-handlers';
import { formatWave5Subscribe } from '../../src/platform/telegram/handlers/wave5-routes';

/**
 * Intended prices in USD/month. Declared locally on purpose: if a price changes,
 * this table must be edited too, which forces a deliberate decision instead of
 * the test silently agreeing with whatever the code happens to say.
 */
const EXPECTED_PLATFORM_PRICES: Record<string, number> = {
  FREE: 0, STARTER: 49, PRO: 99, ENTERPRISE: 299, MASTER: 999,
};
const EXPECTED_SIGNALS_PRICES: Record<string, number> = {
  SIGNALS_BASIC: 29, SIGNALS_PRO: 99, SIGNALS_ENTERPRISE: 299,
};

/** Tiers that may legitimately carry no self-serve price. */
const NON_PRICED_KEYS = new Set<string>(['FREE', 'MASTER']);

/** Tier keys the LicenseTier vocabulary and the feature gate accept. */
const KNOWN_TIER_KEYS = new Set<string>([
  ...Object.values(LicenseTier),
  ...Object.keys(EXPECTED_SIGNALS_PRICES),
]);
const KNOWN_KEYS_LIST = [...KNOWN_TIER_KEYS].join(', ');

interface ServedTier {
  tier: string;
  label: string;
  amount_cents: number;
  currency: string;
  selfServe?: boolean;
  features: string[];
}

async function getServedTiers(): Promise<ServedTier[]> {
  const response = await handleGetTiers();
  expect(response.status).toBe(200);
  const body = (await response.json()) as { tiers: ServedTier[] };
  expect(Array.isArray(body.tiers)).toBe(true);
  return body.tiers;
}

/**
 * Every tier name this formatter advertises, read from the numbered, bolded list
 * items it builds tier blocks from (`*1. Signals Basic*`). Each heading is returned
 * as the customer sees it, normalised for comparison, so a renamed or invented
 * tier reaches the assertion instead of being silently unrecognised.
 */
function advertisedTierHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const [, segment] of text.matchAll(/\*(\d+\.[^*]+)\*/g)) {
    headings.push(segment.replace(/^\d+\.\s*/, '').trim().toLowerCase());
  }
  return headings;
}

/** Escape a literal for safe interpolation into a RegExp source. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve an advertised heading to the tier key it names, so the invariant can be
 * asserted against a key rather than a customer-facing string. Matching is exact
 * on purpose: `BASIC` must not resolve to `SIGNALS_BASIC` by substring luck —
 * that is precisely the ambiguity that hid the original defect.
 */
function headingToTierKey(heading: string): string | null {
  const direct = heading.toUpperCase();
  if (KNOWN_TIER_KEYS.has(direct)) return direct;

  for (const [key, tier] of Object.entries(NOWPAYMENTS_TIERS)) {
    if (heading === tier.name.toLowerCase()) return key;
  }
  return null;
}

describe('platform price tables agree', () => {
  it('PRICING_TIERS and PRICING state the same monthly price in the same unit', () => {
    for (const tier of Object.keys(PRICING_TIERS)) {
      const canonical = PRICING_TIERS[tier].price;
      const served = PRICING[tier];
      expect(
        served,
        `PRICING is missing tier ${tier} — it exists in PRICING_TIERS at $${canonical}/mo`,
      ).toBeDefined();
      expect(
        canonical * 100,
        `price drift for ${tier}: PRICING_TIERS says $${canonical}/mo (=${canonical * 100} cents) ` +
          `but PRICING says ${served.amount_cents} cents`,
      ).toBe(served.amount_cents);
    }
  });

  it('PRICING_TIERS carries the intended price for every tier the API serves', () => {
    for (const [tier, expected] of Object.entries(EXPECTED_PLATFORM_PRICES)) {
      expect(
        PRICING_TIERS[tier],
        `PRICING_TIERS is missing ${tier} — the canonical table must cover every advertised tier`,
      ).toBeDefined();
      expect(
        PRICING_TIERS[tier].price,
        `unexpected price for ${tier}: got $${PRICING_TIERS[tier].price}/mo, expected $${expected}/mo`,
      ).toBe(expected);
    }
  });
});

describe('signals product line is separate and self-consistent', () => {
  it('NOWPAYMENTS_TIERS prices the signals line at the intended values', () => {
    for (const [key, expected] of Object.entries(EXPECTED_SIGNALS_PRICES)) {
      const config = NOWPAYMENTS_TIERS[key];
      expect(config, `NOWPAYMENTS_TIERS is missing signals tier ${key}`).toBeDefined();
      expect(
        config.price,
        `signals price drift for ${key}: NOWPAYMENTS_TIERS says $${config.price}/mo, ` +
          `expected $${expected}/mo`,
      ).toBe(expected);
    }
  });

  it('keeps signals keys out of the platform price table so the lines never collide', () => {
    for (const key of Object.keys(EXPECTED_SIGNALS_PRICES)) {
      expect(Object.keys(PRICING)).not.toContain(key);
      expect(Object.keys(PRICING_TIERS)).not.toContain(key);
    }
  });
});

describe('enterprise ACV agrees with the canonical monthly price', () => {
  it.each([
    ['pro', 'PRO'],
    ['enterprise', 'ENTERPRISE'],
    ['master', 'MASTER'],
  ])('ENTERPRISE_ACV.%s / 12 equals PRICING_TIERS[%s].price', (acvKey, tierKey) => {
    const monthly = ENTERPRISE_ACV[acvKey as EnterpriseTier] / 12;
    expect(
      monthly,
      `annual contract disagreement for ${tierKey}: ACV implies $${monthly}/mo, ` +
        `canonical says $${PRICING_TIERS[tierKey].price}/mo`,
    ).toBe(PRICING_TIERS[tierKey].price);
  });
});

describe('customer-facing surfaces advertise only real tier keys', () => {
  it('the public tiers endpoint serves no key outside LicenseTier and the signals set', async () => {
    const tiers = await getServedTiers();
    expect(tiers.length).toBeGreaterThan(0);

    for (const served of tiers) {
      expect(
        KNOWN_TIER_KEYS.has(served.tier),
        `unmappable tier key "${served.tier}" served by the public tiers endpoint — no ` +
          `license key, price table, or feature gate recognises it, so a customer who ` +
          `selects it cannot be fulfilled. Known keys: ${KNOWN_KEYS_LIST}`,
      ).toBe(true);
    }
  });

  it('the Telegram subscribe flow advertises no unmappable tier key', () => {
    const advertised = advertisedTierHeadings(formatWave5Subscribe());
    expect(advertised.length, 'no tier headings found to check — extraction is broken').toBeGreaterThan(0);

    for (const heading of advertised) {
      const key = headingToTierKey(heading);
      expect(
        key,
        `Telegram subscribe advertises "${heading}", which does not resolve to any real tier — ` +
          `a customer who picks it cannot be fulfilled. Known keys: ${KNOWN_KEYS_LIST}`,
      ).not.toBeNull();
    }
  });

  it('shows a USD price beside every tier row it advertises', () => {
    const text = formatWave5Subscribe();

    for (const heading of advertisedTierHeadings(text)) {
      expect(
        text,
        `Telegram subscribe advertises "${heading}" with no price shown — a customer is ` +
          `offered a tier they cannot cost, which is the defect class that hid the ` +
          `original unpriced BASIC/PREMIUM list`,
      ).toMatch(new RegExp(`\\*\\d+\\.\\s*${escapeRegex(heading)}\\*\\s*—\\s*\\$\\d+`, 'i'));
    }
  });
});

describe('every advertised tier resolves to a canonical price', () => {
  it('serves a price from PRICING, or is explicitly non-self-serve', async () => {
    for (const served of await getServedTiers()) {
      const resolved = getTierPrice(served.tier);
      expect(
        resolved !== null || NON_PRICED_KEYS.has(served.tier),
        `tier ${served.tier} is advertised at ${served.amount_cents} cents but ` +
          `getTierPrice("${served.tier}") returns null and it is not FREE/MASTER — ` +
          `a customer-facing tier with no price`,
      ).toBe(true);
    }
  });
});

describe('the tiers endpoint is bound to the pricing module', () => {
  /**
   * Regression guard for defect D2 — `handleGetTiers` hardcoded its own literal
   * tier list instead of reading `PRICING` / `getTierPrice()`, which made the
   * served payload an independent sixth price source. The handler was since
   * rewritten; this pins the contract so it cannot silently regress.
   */
  it('serves amount_cents equal to getTierPrice(tier) for every tier', async () => {
    for (const served of await getServedTiers()) {
      const canonical = getTierPrice(served.tier);
      expect(
        canonical,
        `served tier ${served.tier} has no entry in PRICING — it cannot be priced canonically`,
      ).not.toBeNull();
      expect(
        served.amount_cents,
        `tier ${served.tier}: the endpoint served ${served.amount_cents} cents while the ` +
          `pricing module says ${canonical?.amount_cents} cents — the handler must derive ` +
          `its row from PRICING/getTierPrice instead of its own literal`,
      ).toBe(canonical?.amount_cents);
    }
  });

  it('serves exactly the tier set the pricing module defines, in neither direction', async () => {
    const servedKeys = (await getServedTiers()).map((t) => t.tier).sort();
    const pricedKeys = Object.keys(PRICING).sort();

    for (const key of pricedKeys) {
      expect(
        servedKeys,
        `tier ${key} is priced in PRICING but absent from the served tier list — a priced ` +
          `tier the API will not show. Served: ${servedKeys.join(', ')}`,
      ).toContain(key);
    }
    for (const key of servedKeys) {
      expect(
        pricedKeys,
        `tier ${key} is served but absent from PRICING — it is priced by a literal, not ` +
          `by the pricing module. Priced: ${pricedKeys.join(', ')}`,
      ).toContain(key);
    }
  });

  /**
   * Defect D1 — MASTER was served as "Master (Custom)" alongside amount_cents
   * 99900, so a user picking "Custom" was auto-charged $999/mo. The invariant is
   * not "the label must not contain a word" (a string sniff) but the behavioural
   * rule: anything the customer cannot check out themselves must be excluded from
   * the self-serve set, and its label must state the real price.
   */
  it('serves no tier labelled a negotiated custom quote while marked self-serve', async () => {
    for (const served of await getServedTiers()) {
      const promisesCustom = /custom|quote|liên hệ/i.test(served.label);

      expect(
        promisesCustom && served.selfServe === true,
        `tier ${served.tier} is labelled "${served.label}" (implying a negotiated quote) ` +
          `but is marked selfServe and charges ${served.amount_cents} cents — a customer ` +
          `is told the price is custom and then charged automatically (defect D1)`,
      ).toBe(false);
    }
  });

  it('serves no tier labelled a negotiated custom quote while carrying a charge amount', async () => {
    for (const served of await getServedTiers()) {
      const promisesCustom = /custom|quote|liên hệ/i.test(served.label);

      expect(
        promisesCustom && served.amount_cents > 0,
        `tier ${served.tier} is labelled "${served.label}" but charges ` +
          `${served.amount_cents} cents — a customer told the price is custom is then ` +
          `charged automatically (defect D1)`,
      ).toBe(false);
    }
  });
});
