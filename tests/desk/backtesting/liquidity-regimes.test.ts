/**
 * Liquidity regime classification tests.
 */
import { describe, it, expect } from 'vitest';
import {
  LIQUIDITY_REGIMES,
  DEFAULT_LIQUIDITY_REGIME_THRESHOLDS,
  classifyLiquidityRegime,
  classifyLiquiditySeries,
  computeBookDepthUsd,
  type LiquidityObservation,
} from '../../../src/desk/backtesting/liquidity-regimes';

describe('LIQUIDITY_REGIMES', () => {
  it('exports exactly four stable labels', () => {
    expect(LIQUIDITY_REGIMES).toEqual([
      'abundant',
      'depth-constrained',
      'spread-constrained',
      'illiquid',
    ]);
  });
});

describe('classifyLiquidityRegime', () => {
  it('reaches all four labels with crafted inputs', () => {
    const observed = new Set([
      classifyLiquidityRegime({ spreadBps: 20, depthUsd: 50_000 }), // abundant
      classifyLiquidityRegime({ spreadBps: 20, depthUsd: 1_000 }), // depth-constrained
      classifyLiquidityRegime({ spreadBps: 500, depthUsd: 50_000 }), // spread-constrained
      classifyLiquidityRegime({ spreadBps: 500, depthUsd: 1_000 }), // illiquid
    ]);
    expect(observed).toEqual(new Set(LIQUIDITY_REGIMES));
  });

  it('assigns exactly one label to every observation', () => {
    const grid: LiquidityObservation[] = [];
    for (const spreadBps of [0, 50, 199, 200, 5000]) {
      for (const depthUsd of [0, 5000, 10_000, 10_001, 1_000_000]) {
        grid.push({ spreadBps, depthUsd });
      }
    }
    for (const observation of grid) {
      const label = classifyLiquidityRegime(observation);
      expect(LIQUIDITY_REGIMES).toContain(label);
    }
  });

  it('treats threshold boundaries as the worse regime', () => {
    const { wideSpreadBps, thinDepthUsd } = DEFAULT_LIQUIDITY_REGIME_THRESHOLDS;
    expect(classifyLiquidityRegime({ spreadBps: wideSpreadBps, depthUsd: thinDepthUsd + 1 })).toBe(
      'spread-constrained',
    );
    expect(classifyLiquidityRegime({ spreadBps: wideSpreadBps - 1, depthUsd: thinDepthUsd })).toBe(
      'depth-constrained',
    );
  });

  it('treats missing (NaN) inputs as the worst plausible case and ranks Infinity normally', () => {
    expect(classifyLiquidityRegime({ spreadBps: Number.NaN, depthUsd: 50_000 })).toBe(
      'spread-constrained',
    );
    expect(classifyLiquidityRegime({ spreadBps: 10, depthUsd: Number.POSITIVE_INFINITY })).toBe(
      'abundant',
    );
    expect(classifyLiquidityRegime({ spreadBps: Number.NaN, depthUsd: Number.NaN })).toBe('illiquid');
  });

  it('honours caller-supplied thresholds', () => {
    const observation = { spreadBps: 100, depthUsd: 20_000 };
    expect(classifyLiquidityRegime(observation)).toBe('abundant');
    expect(
      classifyLiquidityRegime(observation, { wideSpreadBps: 50, thinDepthUsd: 25_000 }),
    ).toBe('illiquid');
  });
});

describe('classifyLiquiditySeries', () => {
  it('classifies each observation in order with one label each', () => {
    const observations: LiquidityObservation[] = [
      { spreadBps: 20, depthUsd: 50_000 },
      { spreadBps: 20, depthUsd: 1_000 },
      { spreadBps: 500, depthUsd: 50_000 },
      { spreadBps: 500, depthUsd: 1_000 },
    ];
    const labels = classifyLiquiditySeries(observations);
    expect(labels).toEqual(['abundant', 'depth-constrained', 'spread-constrained', 'illiquid']);
    expect(labels.length).toBe(observations.length);
  });

  it('returns an empty array for an empty series', () => {
    expect(classifyLiquiditySeries([])).toEqual([]);
  });
});

describe('computeBookDepthUsd', () => {
  it('averages both sides within the band', () => {
    const bids = [
      { price: 0.49, quantity: 10_000 },
      { price: 0.4, quantity: 100_000 }, // outside 2% band of 0.5 mid
    ];
    const asks = [{ price: 0.51, quantity: 10_000 }];
    // bid: 0.49*10k = 4,900 within band; ask: 0.51*10k = 5,100; half of 10,000.
    expect(computeBookDepthUsd(bids, asks, 0.02)).toBeCloseTo(5_000, 6);
  });

  it('returns 0 when either side is empty or the band is invalid', () => {
    expect(computeBookDepthUsd([], [{ price: 0.5, quantity: 10 }])).toBe(0);
    expect(computeBookDepthUsd([{ price: 0.5, quantity: 10 }], [])).toBe(0);
    expect(computeBookDepthUsd([{ price: 0.5, quantity: 10 }], [{ price: 0.5, quantity: 10 }], 0)).toBe(0);
  });
});
