import { describe, it, expect } from 'vitest';
import { DynamicLpEngine } from '../../../../src/desk/mm/dynamic-lp-engine';
import type { MarketMakingContext } from '../../../../src/desk/mm/dynamic-lp-types';

describe('DynamicLpEngine', () => {
  const engine = new DynamicLpEngine({
    targetSpreadPct: 0.04,
    maxInventoryAbs: 1000,
    inventoryRiskAversion: 0.5,
    orderSizeShares: 100,
    minSpreadPct: 0.01,
  });

  it('generates symmetric two-sided quote around fair probability when inventory is zero', () => {
    const ctx: MarketMakingContext = {
      marketId: 'm-election',
      fairProbability: 0.50,
      currentInventoryShares: 0,
    };

    const quote = engine.generateQuote(ctx, 1000);
    expect(quote.marketId).toBe('m-election');
    expect(quote.bidPrice).toBeLessThan(0.50);
    expect(quote.askPrice).toBeGreaterThan(0.50);
    expect(quote.bidPrice).toBeCloseTo(0.48, 2);
    expect(quote.askPrice).toBeCloseTo(0.52, 2);
    expect(quote.bidSize).toBe(100);
    expect(quote.askSize).toBe(100);
    expect(quote.inventorySkewOffset).toBe(0);
  });

  it('skews prices and sizes downward when holding long inventory to discourage buying', () => {
    const ctx: MarketMakingContext = {
      marketId: 'm-long',
      fairProbability: 0.50,
      currentInventoryShares: 800, // 80% long inventory
    };

    const quote = engine.generateQuote(ctx, 1000);
    // Inventory skew offset should be negative
    expect(quote.inventorySkewOffset).toBeLessThan(0);
    // Both bid and ask should shift lower than neutral (0.48 / 0.52)
    expect(quote.bidPrice).toBeLessThan(0.48);
    expect(quote.askPrice).toBeLessThan(0.52);
    // Bid size should be throttled down
    expect(quote.bidSize).toBeLessThan(100);
    expect(quote.askSize).toBe(100);
  });

  it('skews prices and sizes upward when holding short inventory to encourage buying', () => {
    const ctx: MarketMakingContext = {
      marketId: 'm-short',
      fairProbability: 0.50,
      currentInventoryShares: -800, // 80% short inventory
    };

    const quote = engine.generateQuote(ctx, 1000);
    expect(quote.inventorySkewOffset).toBeGreaterThan(0);
    expect(quote.bidPrice).toBeGreaterThan(0.48);
    expect(quote.askPrice).toBeGreaterThan(0.52);
    expect(quote.bidSize).toBe(100);
    expect(quote.askSize).toBeLessThan(100);
  });

  it('widens spread when toxic flow is detected or volatility index is elevated', () => {
    const neutralCtx: MarketMakingContext = {
      marketId: 'm-norm',
      fairProbability: 0.60,
      currentInventoryShares: 0,
      volatilityIndex: 1.0,
      isToxicFlowDetected: false,
    };
    const neutralQuote = engine.generateQuote(neutralCtx);

    const toxicCtx: MarketMakingContext = {
      marketId: 'm-toxic',
      fairProbability: 0.60,
      currentInventoryShares: 0,
      volatilityIndex: 1.5,
      isToxicFlowDetected: true,
    };
    const toxicQuote = engine.generateQuote(toxicCtx);

    expect(toxicQuote.effectiveSpread).toBeGreaterThan(neutralQuote.effectiveSpread);
  });

  it('enforces boundary clamps near extreme probabilities (0.01 and 0.99)', () => {
    const lowCtx: MarketMakingContext = {
      marketId: 'm-low',
      fairProbability: 0.005,
      currentInventoryShares: 0,
    };
    const lowQuote = engine.generateQuote(lowCtx);
    expect(lowQuote.bidPrice).toBeGreaterThanOrEqual(0.001);
    expect(lowQuote.askPrice).toBeGreaterThan(lowQuote.bidPrice);

    const highCtx: MarketMakingContext = {
      marketId: 'm-high',
      fairProbability: 0.995,
      currentInventoryShares: 0,
    };
    const highQuote = engine.generateQuote(highCtx);
    expect(highQuote.askPrice).toBeLessThanOrEqual(0.999);
    expect(highQuote.askPrice).toBeGreaterThan(highQuote.bidPrice);
  });

  it('supports default options in constructor', () => {
    const defaultEngine = new DynamicLpEngine({
      targetSpreadPct: 0.05,
      maxInventoryAbs: 500,
      orderSizeShares: 50,
    });
    const quote = defaultEngine.generateQuote({
      marketId: 'm-default',
      fairProbability: 0.5,
      currentInventoryShares: 0,
    });
    expect(quote.bidSize).toBe(50);
    expect(quote.askSize).toBe(50);
  });
});
