import { describe, it, expect } from 'vitest';
import { CorwinSchultzEngine } from '../../../../src/desk/corwinschultz/corwinschultz-engine.js';
import { CorwinSchultzBar } from '../../../../src/desk/corwinschultz/corwinschultz-types.js';

describe('CorwinSchultzEngine (2012 High-Low Bid-Ask Spread Estimator)', () => {
  const sampleBars: CorwinSchultzBar[] = [
    { high: 105, low: 98 },
    { high: 107, low: 101 },
    { high: 106, low: 100 },
    { high: 104, low: 97 },
    { high: 108, low: 102 },
  ];

  it('validates bars strictly', () => {
    expect(() => CorwinSchultzEngine.validateBars([])).toThrow();
    expect(() => CorwinSchultzEngine.validateBars([{ high: 100, low: 95 }])).toThrow();
    expect(() => CorwinSchultzEngine.validateBars([{ high: -10, low: -15 }, { high: 100, low: 90 }])).toThrow();
    expect(() => CorwinSchultzEngine.validateBars([{ high: 90, low: 100 }, { high: 105, low: 95 }])).toThrow();
  });

  it('estimates positive spread and reasonable range volatility', () => {
    const res = CorwinSchultzEngine.estimate(sampleBars);

    expect(res.pairCount).toBe(4);
    expect(res.spread).toBeGreaterThanOrEqual(0);
    expect(res.spreadBps).toBeGreaterThanOrEqual(0);
    expect(res.volatility).toBeGreaterThan(0.1);
    expect(res.volatility).toBeLessThan(1.5);
    expect(res.rawBeta).toBeGreaterThan(0);
    expect(res.rawGamma).toBeGreaterThan(0);
  });

  it('clamps negative alpha spreads to zero when configured', () => {
    // When 2-day combined range is substantially larger than individual daily ranges (e.g. huge trend gap)
    const trendingBars: CorwinSchultzBar[] = [
      { high: 101, low: 100 },
      { high: 120, low: 119 },
    ];
    const resClamped = CorwinSchultzEngine.estimate(trendingBars, { clampNegativeToZero: true });
    const resUnclamped = CorwinSchultzEngine.estimate(trendingBars, { clampNegativeToZero: false });

    expect(resClamped.spread).toBe(0);
    expect(resClamped.spreadBps).toBe(0);
    expect(resUnclamped.spread).toBeLessThanOrEqual(0);
  });

  it('handles flat prices gracefully', () => {
    const flatBars: CorwinSchultzBar[] = [
      { high: 100, low: 100 },
      { high: 100, low: 100 },
    ];
    const res = CorwinSchultzEngine.estimate(flatBars);
    expect(res.spread).toBe(0);
    expect(res.volatility).toBe(0);
    expect(res.rawBeta).toBe(0);
    expect(res.rawGamma).toBe(0);
  });
});
