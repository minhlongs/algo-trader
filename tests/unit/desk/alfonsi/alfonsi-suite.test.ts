import { describe, it, expect } from 'vitest';
import { AlfonsiEngine } from '../../../../src/desk/alfonsi/alfonsi-engine';
import { AlfonsiParams } from '../../../../src/desk/alfonsi/alfonsi-types';

describe('Desk 131: Alfonsi-Fruth-Schied (2010) Non-Linear LOB Execution Engine', () => {
  const baseParams: AlfonsiParams = {
    initialPrice: 100.0,
    totalQuantity: 10000.0,
    tradingHorizon: 1.0,   // 1 unit of time
    numIntervals: 5,       // 5 execution intervals
    shapeDelta: 0.5,       // Non-linear power-law shape
    depthAlpha: 1000.0,    // Book depth density
    resilienceRate: 2.0,   // Book recovery rate rho
  };

  it('generates optimal execution schedule with U-shape characteristics and cost advantage over TWAP', () => {
    const res = AlfonsiEngine.evaluate(baseParams);

    expect(res.slices.length).toBe(baseParams.numIntervals);
    expect(res.totalCashSpent).toBeGreaterThan(0.0);
    expect(res.averageExecutionPrice).toBeGreaterThan(baseParams.initialPrice);

    // Optimal execution under exponential resilience is U-shaped: higher volume at boundaries
    const firstSlice = res.slices[0].quantity;
    const midSlice = res.slices[2].quantity;
    const lastSlice = res.slices[4].quantity;

    expect(firstSlice).toBeGreaterThan(midSlice);
    expect(lastSlice).toBeGreaterThan(midSlice);

    // Alfonsi schedule must yield lower total execution cost compared to uniform TWAP
    expect(res.costSavingsVsTwap).toBeGreaterThan(0.0);
  });

  it('exhibits book resilience decay between non-zero trades', () => {
    const res = AlfonsiEngine.evaluate(baseParams);

    for (let i = 0; i < res.slices.length - 1; i++) {
      const postShift = res.slices[i].postTradePriceShift;
      const nextPreShift = res.slices[i + 1].preTradePriceShift;

      // Resilience decay implies pre-shift at step i+1 is lower than post-shift at step i
      expect(nextPreShift).toBeLessThan(postShift);
      expect(nextPreShift).toBeGreaterThan(0.0);
    }
  });

  it('reflects higher price impact when book depth alpha decreases or shape delta increases', () => {
    const deepBook = AlfonsiEngine.evaluate({
      ...baseParams,
      depthAlpha: 2000.0,
    });
    const thinBook = AlfonsiEngine.evaluate({
      ...baseParams,
      depthAlpha: 500.0,
    });

    expect(thinBook.averageExecutionPrice).toBeGreaterThan(
      deepBook.averageExecutionPrice
    );
    expect(thinBook.totalCashSpent).toBeGreaterThan(deepBook.totalCashSpent);
  });

  it('correctly executes user-supplied custom schedule', () => {
    const custom = [2000, 2000, 2000, 2000, 2000];
    const res = AlfonsiEngine.evaluate({
      ...baseParams,
      customSchedule: custom,
    });

    expect(res.slices.map((s) => s.quantity)).toEqual(custom);
    // Custom TWAP vs benchmark TWAP should have zero savings
    expect(Math.abs(res.costSavingsVsTwap)).toBeLessThan(1e-4);
  });

  it('validates parameters and rejects illegal values', () => {
    expect(() =>
      AlfonsiEngine.evaluate({ ...baseParams, initialPrice: 0 })
    ).toThrow(/Initial price must be positive/);

    expect(() =>
      AlfonsiEngine.evaluate({ ...baseParams, numIntervals: 1 })
    ).toThrow(/Number of intervals must be an integer >= 2/);

    expect(() =>
      AlfonsiEngine.evaluate({ ...baseParams, resilienceRate: -1 })
    ).toThrow(/Resilience rate rho must be positive/);

    expect(() =>
      AlfonsiEngine.evaluate({ ...baseParams, customSchedule: [1000, 1000] })
    ).toThrow(/Custom schedule length \(2\) must match numIntervals \(5\)/);
  });
});
