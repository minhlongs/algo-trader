/**
 * Cross-source price agreement — the repo's price tables must agree, and the
 * values they agree on must be the intended ones.
 *
 * The repo carries two product lines, not contradictory tables:
 *   platform — Free $0, Starter $49, Pro $99, Enterprise $299, Master $999
 *   signals  — Signals Basic $29, Signals Pro $99, Signals Enterprise $299
 * This test pins both lines to their canonical source so future drift fails
 * loudly here instead of silently diverging across the API and the gateway.
 */

import { describe, it, expect } from 'vitest';
import { PRICING_TIERS } from '../../../src/platform/billing/pricing-tiers';
import { PRICING } from '../../../src/platform/workers/api/subscriptions-types';
import { NOWPAYMENTS_TIERS } from '../../../src/platform/billing/nowpayments-types';
import { ENTERPRISE_ACV, type EnterpriseTier } from '../../../src/platform/billing/enterprise-inquiry-store';
import {
  EXPECTED_PLATFORM_PRICES,
  EXPECTED_SIGNALS_PRICES,
} from './fixtures';

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
