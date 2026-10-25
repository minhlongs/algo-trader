/**
 * Public-surface pricing safety — the endpoints and flows a customer can reach
 * must advertise only tier keys that exist, at prices the pricing module agrees
 * with, and must never label a charged tier as a negotiated custom quote.
 *
 * Guards the bug classes found in the 2026-10-21 assessment:
 *   an unmappable tier key (`BASIC` / `PREMIUM`) no licence can fulfil,
 *   a tier offered with no price a customer can cost,
 *   a "Custom"-labelled tier carrying a hardcoded self-serve charge.
 */

import { describe, it, expect } from 'vitest';
import { PRICING, getTierPrice } from '../../../src/platform/workers/api/subscriptions-types';
import { handleGetTiers } from '../../../src/platform/workers/api/subscriptions-handlers';
import { formatWave5Subscribe } from '../../../src/platform/telegram/handlers/wave5-routes';
import {
  KNOWN_TIER_KEYS,
  KNOWN_KEYS_LIST,
  NON_PRICED_KEYS,
  escapeRegex,
  headingToTierKey,
  advertisedTierHeadings,
  type ServedTier,
} from './fixtures';

async function getServedTiers(): Promise<ServedTier[]> {
  const response = await handleGetTiers();
  expect(response.status).toBe(200);
  const body = (await response.json()) as { tiers: ServedTier[] };
  expect(Array.isArray(body.tiers)).toBe(true);
  return body.tiers;
}

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

  it('shows a USD price beside every tier row Telegram advertises', () => {
    const text = formatWave5Subscribe();

    for (const heading of advertisedTierHeadings(text)) {
      expect(
        text,
        `Telegram subscribe advertises "${heading}" with no price shown — a customer is ` +
          `offered a tier they cannot cost`,
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
   * The handler once hardcoded its own literal tier list instead of reading
   * `PRICING` / `getTierPrice()`, which made the served payload an independent
   * sixth price source. This pins the contract so it cannot silently regress.
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
   * MASTER was served as "Master (Custom)" alongside amount_cents 99900, so a
   * user picking "Custom" was auto-charged $999/mo. The invariant is not "the
   * label must not contain a word" (a string sniff) but the behavioural rule:
   * a tier the customer cannot check out themselves must not be marked
   * self-serve, and no tier may carry a charge while promising a quote.
   */
  it('serves no quote-labelled tier as self-serve, or carrying a charge', async () => {
    for (const served of await getServedTiers()) {
      const promisesCustom = /custom|quote|liên hệ/i.test(served.label);

      expect(
        promisesCustom && served.selfServe === true,
        `tier ${served.tier} is labelled "${served.label}" (implying a negotiated quote) ` +
          `but is marked selfServe and charges ${served.amount_cents} cents — a customer ` +
          `is told the price is custom and then charged automatically`,
      ).toBe(false);

      expect(
        promisesCustom && served.amount_cents > 0,
        `tier ${served.tier} is labelled "${served.label}" but charges ` +
          `${served.amount_cents} cents — a customer told the price is custom is then ` +
          `charged automatically`,
      ).toBe(false);
    }
  });
});
