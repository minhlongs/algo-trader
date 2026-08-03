import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONFIG,
  computeBidPrice,
  computeAskPrice,
  updateSkew,
} from '../market-maker';

describe('market-maker::DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.baseSpread).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.quoteSizeUsdc).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.refreshIntervalMs).toBeGreaterThan(0);
    expect(DEFAULT_CONFIG.maxInventorySkew).toBeGreaterThan(0);
  });
});

describe('market-maker::computeBidPrice', () => {
  it('returns fairValue minus half spread at zero skew', () => {
    expect(computeBidPrice(0.5, 0.02, 0, 1)).toBeCloseTo(0.49, 4);
  });
  it('returns fairValue minus half spread at positive skew', () => {
    expect(computeBidPrice(0.5, 0.02, 0.1, 1)).toBeCloseTo(0.49, 4);
  });
});

describe('market-maker::computeAskPrice', () => {
  it('returns fairValue plus half spread at zero skew', () => {
    expect(computeAskPrice(0.5, 0.02, 0, 1)).toBeCloseTo(0.51, 4);
  });
  it('returns fairValue plus half spread at negative skew', () => {
    expect(computeAskPrice(0.5, 0.02, -0.1, 1)).toBeCloseTo(0.51, 4);
  });
});

describe('market-maker::updateSkew', () => {
  it('returns initial skew when no fill (sideFilled=bid)', () => {
    expect(updateSkew(0, 'bid')).toBe(1);
  });
  it('updates skew after filling bid', () => {
    const r = updateSkew(0.1, 'bid');
    expect(r).toBeCloseTo(1.1, 5);
  });
  it('updates skew after filling ask', () => {
    const r = updateSkew(-0.1, 'ask');
    expect(r).toBeCloseTo(-1.1, 5);
  });
  it('returns finite number', () => {
    const r = updateSkew(0.1, 1, 0.01);
    expect(Number.isFinite(r)).toBe(true);
  });
});
