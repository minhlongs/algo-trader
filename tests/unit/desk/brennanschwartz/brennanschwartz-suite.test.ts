import { describe, it, expect } from 'vitest';
import { BrennanSchwartzEngine } from '../../../../src/desk/brennanschwartz/brennanschwartz-engine.js';
import { BrennanSchwartzParams } from '../../../../src/desk/brennanschwartz/brennanschwartz-types.js';

describe('Desk 172: Brennan-Schwartz (1979) Two-Factor Rate Engine', () => {
  const baseParams: BrennanSchwartzParams = {
    shortRate: 0.04,
    longRate: 0.05,
    shortRateMeanReversion: 0.8,
    longRateMeanReversion: 0.3,
    longRateTarget: 0.055,
    shortRateVol: 0.02,
    longRateVol: 0.015,
    rateCorrelation: 0.45,
    shortRateRiskPremium: 0.002,
  };

  it('validates model parameters and rejects invalid inputs', () => {
    expect(() =>
      BrennanSchwartzEngine.priceZeroCouponBond(
        { ...baseParams, shortRateVol: -0.01 },
        1.0
      )
    ).toThrow(/shortRateVol must be non-negative/);

    expect(() =>
      BrennanSchwartzEngine.priceZeroCouponBond(
        { ...baseParams, rateCorrelation: 1.5 },
        1.0
      )
    ).toThrow(/rateCorrelation must be between -1.0 and 1.0/);

    expect(() =>
      BrennanSchwartzEngine.priceZeroCouponBond(baseParams, 0)
    ).toThrow(/maturity must be positive/);
  });

  it('calculates zero-coupon bond prices with monotonic maturity discounting', () => {
    const bond1Y = BrennanSchwartzEngine.priceZeroCouponBond(baseParams, 1.0);
    const bond5Y = BrennanSchwartzEngine.priceZeroCouponBond(baseParams, 5.0);
    const bond10Y = BrennanSchwartzEngine.priceZeroCouponBond(baseParams, 10.0);

    expect(bond1Y.zeroBondPrice).toBeGreaterThan(bond5Y.zeroBondPrice);
    expect(bond5Y.zeroBondPrice).toBeGreaterThan(bond10Y.zeroBondPrice);

    expect(bond1Y.yieldToMaturity).toBeGreaterThan(0);
    expect(bond5Y.yieldToMaturity).toBeGreaterThan(0);
    expect(bond10Y.yieldToMaturity).toBeGreaterThan(0);
    expect(bond1Y.curveSlope).toBeCloseTo(0.01, 3);
  });

  it('simulates coupled SDE trajectories with mean-reversion drift and positive rates', () => {
    const sim = BrennanSchwartzEngine.simulate(baseParams, 2.0, 50);

    expect(sim.steps.length).toBe(51);
    expect(sim.meanShortRate).toBeGreaterThan(0);
    expect(sim.meanLongRate).toBeGreaterThan(0);
    expect(sim.steps[0].shortRate).toBe(baseParams.shortRate);
    expect(sim.steps[0].longRate).toBe(baseParams.longRate);
    expect(sim.terminalSpread).toBe(sim.terminalLongRate - sim.terminalShortRate);
  });
});
