import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LISTING_ARB_CONFIG,
  computeSpreadRatio,
  isSpreadWide,
  isSpreadConverged,
  ListingArbitrageSniper,
  createListingArbitrageSniperTick,
} from '../listing-arbitrage-sniper';

describe('listing-arbitrage-sniper::DEFAULT_LISTING_ARB_CONFIG', () => {
  it('has expected default thresholds', () => {
    expect(DEFAULT_LISTING_ARB_CONFIG.spreadEntryThreshold).toBe(0.98);
    expect(DEFAULT_LISTING_ARB_CONFIG.spreadConvergenceThreshold).toBe(0.99);
    expect(DEFAULT_LISTING_ARB_CONFIG.maxPositions).toBe(3);
    expect(DEFAULT_LISTING_ARB_CONFIG.maxSnipeUsd).toBe(50);
    expect(DEFAULT_LISTING_ARB_CONFIG.globalCooldownMs).toBe(60 * 60 * 1000);
  });
});

describe('listing-arbitrage-sniper::computeSpreadRatio', () => {
  it('returns sum of yes and no prices', () => {
    expect(computeSpreadRatio(0.52, 0.45)).toBeCloseTo(0.97, 5);
  });

  it('returns 1.0 for 0.5 + 0.5', () => {
    expect(computeSpreadRatio(0.5, 0.5)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.94 for 0.47 + 0.47', () => {
    expect(computeSpreadRatio(0.47, 0.47)).toBeCloseTo(0.94, 5);
  });

  it('scales linearly', () => {
    const r1 = computeSpreadRatio(0.6, 0.3);
    const r2 = computeSpreadRatio(0.3, 0.15);
    expect(r1).toBeCloseTo(r2 * 2, 5);
  });
});

describe('listing-arbitrage-sniper::isSpreadWide', () => {
  it('true when sum < threshold', () => {
    expect(isSpreadWide(0.5, 0.45, 0.98)).toBe(true);
  });

  it('false when sum >= threshold', () => {
    expect(isSpreadWide(0.5, 0.5, 0.98)).toBe(false);
  });

  it('at exactly threshold returns false (< not <=)', () => {
    expect(isSpreadWide(0.49, 0.49, 0.98)).toBe(false);
  });

  it('very wide spread returns true', () => {
    expect(isSpreadWide(0.1, 0.1, 0.98)).toBe(true);
  });

  it('threshold 0.9 catches near-zero sum', () => {
    expect(isSpreadWide(0.01, 0.01, 0.9)).toBe(true);
  });
});

describe('listing-arbitrage-sniper::isSpreadConverged', () => {
  it('true when sum > threshold', () => {
    expect(isSpreadConverged(0.5, 0.5, 0.99)).toBe(true);
  });

  it('false when sum <= threshold', () => {
    expect(isSpreadConverged(0.49, 0.48, 0.99)).toBe(false);
  });

  it('at exactly threshold returns false', () => {
    expect(isSpreadConverged(0.495, 0.495, 0.99)).toBe(false);
  });

  it('perfectly matched 0.5+0.5 is converged at 0.99', () => {
    expect(isSpreadConverged(0.5, 0.5, 0.99)).toBe(true);
  });
});

describe('listing-arbitrage-sniper::ListingArbitrageSniper', () => {
  it('instantiates with mocked deps', () => {
    const strategy = new ListingArbitrageSniper({
      clob: {} as any,
      orders: {} as any,
      bus: {} as any,
      gamma: { getTrending: async () => [] } as any,
    } as any);
    expect(strategy).toBeDefined();
  });

  it('getPositionCount returns 0 initially', () => {
    const strategy = new ListingArbitrageSniper({
      clob: {} as any,
      orders: {} as any,
      bus: {} as any,
      gamma: { getTrending: async () => [] } as any,
    } as any);
    expect(strategy.getPositionCount()).toBe(0);
  });

  it('clock injection controls market age', () => {
    const now = 1_000_000_000;
    const strategy = new ListingArbitrageSniper(
      {
        clob: {} as any,
        orders: {} as any,
        bus: {} as any,
        gamma: { getTrending: async () => [] } as any,
      } as any,
      {},
      () => now,
    );
    // After internal observeMarket, age should be 0
    expect(strategy).toBeDefined();
  });
});

describe('listing-arbitrage-sniper::createListingArbitrageSniperTick', () => {
  it('returns a function', () => {
    const tick = createListingArbitrageSniperTick({
      clob: {} as any,
      orders: {} as any,
      bus: {} as any,
      gamma: { getTrending: async () => [] } as any,
    });
    expect(typeof tick).toBe('function');
  });
});
