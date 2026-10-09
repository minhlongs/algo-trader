import { describe, it, expect } from 'vitest';
import { ObizhaevaWangEngine } from '../../../../src/desk/obizhaevawang/obizhaeva-wang-engine';
import { ObizhaevaWangParams } from '../../../../src/desk/obizhaevawang/obizhaeva-wang-types';

describe('Desk 125: Obizhaeva-Wang (2013) Optimal Execution with Transient Impact & Resilience', () => {
  const baseParams: ObizhaevaWangParams = {
    totalQuantity: 100_000,
    timeHorizon: 1.0,
    steps: 10,
    resilienceSpeed: 4.0,
    temporaryImpactFactor: 0.00005,
    halfSpread: 0.01,
  };

  it('conserves total order quantity across execution schedule', () => {
    const res = ObizhaevaWangEngine.optimize(baseParams);

    expect(res.schedule.length).toBe(baseParams.steps + 1);

    const sumQty = res.schedule.reduce((acc, slice) => acc + slice.tradeSize, 0);
    expect(sumQty).toBeCloseTo(baseParams.totalQuantity, 5);

    const lastSlice = res.schedule[res.schedule.length - 1];
    expect(lastSlice.cumulativeQuantity).toBeCloseTo(baseParams.totalQuantity, 5);
    expect(lastSlice.remainingQuantity).toBeCloseTo(0.0, 5);
  });

  it('exhibits symmetric discrete block trade jumps at boundaries x_0 and x_N', () => {
    const res = ObizhaevaWangEngine.optimize(baseParams);

    expect(res.initialBlockTrade).toBeCloseTo(res.terminalBlockTrade, 6);
    // Boundary trades should be strictly larger than intermediate slices when rho*tau < 1
    // rho = 4, tau = 0.1 -> rho*tau = 0.4 < 1
    expect(res.initialBlockTrade).toBeGreaterThan(res.intermediateTrade);
  });

  it('delivers lower execution cost than naive uniform TWAP schedule', () => {
    const res = ObizhaevaWangEngine.optimize(baseParams);

    expect(res.optimalTotalCost).toBeLessThan(res.twapTotalCost);
    expect(res.costSavingsAmount).toBeGreaterThan(0.0);
    expect(res.costSavingsPercent).toBeGreaterThan(0.0);
  });

  it('correctly scales with order size and resilience speed', () => {
    const highResilience = ObizhaevaWangEngine.optimize({
      ...baseParams,
      resilienceSpeed: 20.0,
    });

    // Faster resilience reduces market impact drag
    expect(highResilience.optimalTotalCost).toBeLessThan(
      ObizhaevaWangEngine.optimize(baseParams).optimalTotalCost
    );
  });

  it('throws validation error on invalid input parameters', () => {
    expect(() =>
      ObizhaevaWangEngine.optimize({ ...baseParams, totalQuantity: -100 })
    ).toThrow(/Total quantity must be positive/);

    expect(() =>
      ObizhaevaWangEngine.optimize({ ...baseParams, steps: 1 })
    ).toThrow(/Steps must be between 2 and 1000/);

    expect(() =>
      ObizhaevaWangEngine.optimize({ ...baseParams, resilienceSpeed: 0 })
    ).toThrow(/Resilience speed must be positive/);

    expect(() =>
      ObizhaevaWangEngine.optimize({ ...baseParams, halfSpread: -0.05 })
    ).toThrow(/Half spread cannot be negative/);
  });
});
