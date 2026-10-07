import { describe, it, expect } from 'vitest';
import { LiquidityScoreEngine } from '../../../../src/desk/market-data/liquidity-score-engine';
import type { OrderBookSnapshot } from '../../../../src/desk/market-data/liquidity-score-types';

describe('LiquidityScoreEngine', () => {
  const engine = new LiquidityScoreEngine({
    depthBandsPct: [0.01, 0.02, 0.05],
    referenceMaxSpreadBps: 200, // 2%
    referenceTargetDepthUsd: 10000,
  });

  it('evaluates tight book with deep liquidity as high composite score', () => {
    const snapshot: OrderBookSnapshot = {
      marketId: 'pm-presidential-2028',
      timestamp: 1700000000000,
      bids: [
        { price: 0.50, quantity: 20000 },
        { price: 0.495, quantity: 30000 },
      ],
      asks: [
        { price: 0.501, quantity: 20000 },
        { price: 0.505, quantity: 30000 },
      ],
    };

    const res = engine.evaluateLiquidity(snapshot);

    expect(res.midPrice).toBeCloseTo(0.5005, 4);
    expect(res.spreadBps).toBeLessThan(25);
    expect(res.spreadScore).toBeGreaterThan(80);
    expect(res.depthScore).toBeGreaterThan(50);
    expect(res.compositeScore).toBeGreaterThan(70);
    expect(res.bands).toHaveLength(3);
    expect(res.maxRecommendedOrderSizeUsd).toBeGreaterThan(0);
  });

  it('penalizes wide spread with low composite score', () => {
    const snapshot: OrderBookSnapshot = {
      marketId: 'pm-illiquid-market',
      timestamp: 1700000000000,
      bids: [{ price: 0.20, quantity: 100 }],
      asks: [{ price: 0.80, quantity: 100 }],
    };

    const res = engine.evaluateLiquidity(snapshot);

    // Spread is 0.60 on mid 0.50 -> 12,000 bps > 200 bps
    expect(res.spreadScore).toBe(0);
    expect(res.compositeScore).toBeLessThan(10);
    expect(res.maxRecommendedOrderSizeUsd).toBe(0);
  });

  it('accurately aggregates volume across 1%, 2%, and 5% depth bands', () => {
    // mid = 1.00
    // 1% band: [0.99, 1.01]
    // 2% band: [0.98, 1.02]
    // 5% band: [0.95, 1.05]
    const snapshot: OrderBookSnapshot = {
      marketId: 'btc-binary-100k',
      timestamp: 1700000000000,
      bids: [
        { price: 0.995, quantity: 100 }, // in 1%, 2%, 5%
        { price: 0.985, quantity: 200 }, // in 2%, 5%
        { price: 0.960, quantity: 300 }, // in 5%
        { price: 0.900, quantity: 500 }, // outside 5%
      ],
      asks: [
        { price: 1.005, quantity: 100 }, // in 1%, 2%, 5%
        { price: 1.015, quantity: 200 }, // in 2%, 5%
        { price: 1.040, quantity: 300 }, // in 5%
        { price: 1.100, quantity: 500 }, // outside 5%
      ],
    };

    const res = engine.evaluateLiquidity(snapshot);
    const band1 = res.bands.find(b => b.bandPct === 0.01);
    const band2 = res.bands.find(b => b.bandPct === 0.02);
    const band5 = res.bands.find(b => b.bandPct === 0.05);

    expect(band1).toBeDefined();
    expect(band2).toBeDefined();
    expect(band5).toBeDefined();

    expect(band1!.bidNotionalUsd).toBeCloseTo(0.995 * 100, 2);
    expect(band2!.bidNotionalUsd).toBeCloseTo(0.995 * 100 + 0.985 * 200, 2);
    expect(band5!.bidNotionalUsd).toBeCloseTo(0.995 * 100 + 0.985 * 200 + 0.960 * 300, 2);
  });
});
