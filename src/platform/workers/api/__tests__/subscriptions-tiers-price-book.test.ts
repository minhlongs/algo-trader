/**
 * The served tier list must be a view of the price book, not a second copy of it.
 *
 * `handleGetTiers` used to hardcode 0 / 4900 / 9900 / 29900 / 99900. Those numbers
 * matched `PRICING` only because someone typed the same figures twice, so any price edit
 * would have left the advertised price stale and the label "Pro — $99/mo" lying on a
 * tier that actually charges more. These tests pin the endpoint to the same source the
 * checkout invoices from.
 */

import { describe, it, expect } from 'vitest';

import { handleGetTiers } from '../subscriptions-handlers';
import { PRICING, getTierPrice } from '../subscriptions-types';
import { PRICING_TIERS } from '../../../../billing/pricing-tiers';

/** Every tier the endpoint advertises, in served order. */
const SERVED_TIERS = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE', 'MASTER'] as const;

interface ServedTier {
  tier: string;
  label: string;
  amount_cents: number;
  currency: string;
  selfServe: boolean;
  features: string[];
}

async function servedTiers(): Promise<ServedTier[]> {
  const res = await handleGetTiers();
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tiers: ServedTier[] };
  return body.tiers;
}

describe('served tier list reads the price book', () => {
  it('advertises exactly the five priced tiers', async () => {
    const tiers = await servedTiers();
    expect(tiers.map((t) => t.tier)).toEqual([...SERVED_TIERS]);
  });

  it('charges what the price book says for every tier', async () => {
    const tiers = await servedTiers();

    for (const t of tiers) {
      const book = getTierPrice(t.tier);
      // A tier with no price-book row must not be advertised at all.
      expect(book, `price book has no entry for ${t.tier}`).not.toBeNull();
      expect(t.amount_cents).toBe(book?.amount_cents);
      expect(t.amount_cents).toBe(PRICING[t.tier].amount_cents);
    }
  });

  it('agrees with the price book in whole dollars, not just cents', async () => {
    const tiers = await servedTiers();

    for (const t of tiers) {
      const dollars = PRICING_TIERS[t.tier]?.price;
      expect(dollars, `PRICING_TIERS has no entry for ${t.tier}`).toBeDefined();
      // Guards against a price book edited in one unit and not the other.
      expect(t.amount_cents).toBe((dollars ?? 0) * 100);
    }
  });

  it('states in the label the same price it returns in amount_cents', async () => {
    const tiers = await servedTiers();

    for (const t of tiers) {
      if (t.amount_cents === 0) {
        expect(t.label).toMatch(/miễn phí|free/i);
        continue;
      }
      const dollars = t.amount_cents / 100;
      // A stale label is the failure this guards: price edited, prose not.
      expect(t.label, `label for ${t.tier} omits $${dollars}`).toContain(`$${dollars}`);
    }
  });

  it('names every tier after its pricing-tier record', async () => {
    const tiers = await servedTiers();

    for (const t of tiers) {
      if (t.amount_cents === 0) {
        // FREE keeps the bilingual "Miễn phí / Free" label customers already see.
        expect(t.label).toContain(PRICING_TIERS[t.tier].name);
        continue;
      }
      expect(t.label.startsWith(PRICING_TIERS[t.tier].name)).toBe(true);
    }
  });

  it('keeps the response shape callers depend on', async () => {
    const tiers = await servedTiers();

    for (const t of tiers) {
      expect(Object.keys(t)).toEqual([
        'tier',
        'label',
        'amount_cents',
        'currency',
        'selfServe',
        'features',
      ]);
      expect(t.currency).toBe('usd');
      // Only PRO and ENTERPRISE are buyable without contacting sales.
      expect(t.selfServe).toBe(t.tier === 'PRO' || t.tier === 'ENTERPRISE');
    }
  });

  it('still ships marketing copy, not entitlement slugs', async () => {
    const tiers = await servedTiers();

    for (const t of tiers) {
      expect(Array.isArray(t.features)).toBe(true);
      expect(t.features.length).toBeGreaterThan(0);
      // The slugs in PRICING_TIERS are kebab-case capability keys; the served copy is prose.
      for (const f of t.features) {
        expect(f, `features for ${t.tier} must be prose, not a slug`).not.toMatch(/^[a-z]+(-[a-z]+)+$/);
      }
    }
  });
});
