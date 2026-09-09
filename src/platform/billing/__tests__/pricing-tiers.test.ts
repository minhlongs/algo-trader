/**
 * Pricing Tiers — unit tests
 * Verifies PRICING_TIERS mapping, getPricingTier resolution, and annualPrice.
 */

import { describe, it, expect } from 'vitest';
import { PRICING_TIERS, getPricingTier, annualPrice } from '../pricing-tiers';

describe('PRICING_TIERS', () => {
  it('FREE tier is free with 1 strategy and community support', () => {
    expect(PRICING_TIERS.FREE.price).toBe(0);
    expect(PRICING_TIERS.FREE.strategies).toBe(1);
    expect(PRICING_TIERS.FREE.supportLevel).toBe('community');
    expect(PRICING_TIERS.FREE.requestsPerMin).toBe(10);
  });

  it('PRO tier is $99/mo with email support', () => {
    expect(PRICING_TIERS.PRO.price).toBe(99);
    expect(PRICING_TIERS.PRO.supportLevel).toBe('email');
    expect(PRICING_TIERS.PRO.requestsPerMin).toBe(100);
  });

  it('ENTERPRISE tier is $299/mo with dedicated support', () => {
    expect(PRICING_TIERS.ENTERPRISE.price).toBe(299);
    expect(PRICING_TIERS.ENTERPRISE.supportLevel).toBe('dedicated');
    expect(PRICING_TIERS.ENTERPRISE.markets).toEqual(['all']);
  });

  it('MASTER tier is $999/mo with highest limits', () => {
    expect(PRICING_TIERS.MASTER.price).toBe(999);
    expect(PRICING_TIERS.MASTER.strategies).toBe(999);
    expect(PRICING_TIERS.MASTER.requestsPerMin).toBe(9999);
  });
});

describe('getPricingTier', () => {
  it('resolves known tiers case-insensitively', () => {
    expect(getPricingTier('FREE')).toBe(PRICING_TIERS.FREE);
    expect(getPricingTier('pro')).toBe(PRICING_TIERS.PRO);
    expect(getPricingTier('Enterprise')).toBe(PRICING_TIERS.ENTERPRISE);
    expect(getPricingTier('master')).toBe(PRICING_TIERS.MASTER);
  });

  it('falls back to FREE tier for unrecognized license tier', () => {
    // Covers the `|| PRICING_TIERS.FREE` branch (line 96)
    expect(getPricingTier('GOLD')).toBe(PRICING_TIERS.FREE);
    expect(getPricingTier('')).toBe(PRICING_TIERS.FREE);
    expect(getPricingTier('unknown')).toBe(PRICING_TIERS.FREE);
  });
});

describe('annualPrice', () => {
  it('applies 20% discount to monthly price × 12', () => {
    // PRO: 99 * 12 * 0.8 = 950.4
    expect(annualPrice('PRO')).toBeCloseTo(950.4, 5);
    // FREE: 0
    expect(annualPrice('FREE')).toBe(0);
  });
});
