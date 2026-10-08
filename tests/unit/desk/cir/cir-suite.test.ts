import { describe, expect, it } from 'vitest';
import { CirEngine } from '../../../../src/desk/cir/cir-engine';
import { CirModelParameters } from '../../../../src/desk/cir/cir-types';

describe('CirEngine Suite (Desk 75)', () => {
  const engine = new CirEngine();

  // Feller condition: 2 * kappa * theta = 2 * 0.3 * 0.05 = 0.03 >= sigma^2 = 0.015^2 = 0.000225 (Satisfied, ratio = 133.33)
  const standardParams: CirModelParameters = {
    currentShortRateR0: 0.03,      // 3% current short rate
    speedOfReversionKappa: 0.3,    // kappa = 0.3
    longTermMeanTheta: 0.05,       // theta = 5%
    volatilitySigma: 0.02,         // sigma = 2%
  };

  it('should accurately price zero-coupon bond and verify Feller condition', () => {
    const result = engine.priceZeroCouponBond(standardParams, 5.0, 100.0);

    expect(result.maturityYears).toBe(5.0);
    expect(result.bondPriceUsd).toBeGreaterThan(75.0);
    expect(result.bondPriceUsd).toBeLessThan(100.0);
    expect(result.fellerConditionSatisfied).toBe(true);
    expect(result.fellerRatio).toBeGreaterThan(1.0);
    expect(result.durationFactorB).toBeGreaterThan(0.0);
    expect(result.continuouslyCompoundedYieldPct).toBeGreaterThan(3.0);
    expect(result.continuouslyCompoundedYieldPct).toBeLessThan(5.0);
    expect(result.instantaneousForwardRatePct).toBeGreaterThan(0.0);
  });

  it('should generate an upward-sloping term structure when r0 < theta', () => {
    const tenors = [0.5, 1, 3, 5, 10, 20];
    const curve = engine.generateYieldCurve(standardParams, tenors);

    expect(curve.length).toBe(6);
    expect(curve[0]!.yieldPct).toBeLessThan(curve[2]!.yieldPct);
    expect(curve[2]!.yieldPct).toBeLessThan(curve[4]!.yieldPct);
    expect(curve[4]!.yieldPct).toBeLessThan(curve[5]!.yieldPct);
  });

  it('should detect Feller violation when 2 * kappa * theta < sigma^2', () => {
    const violationParams: CirModelParameters = {
      currentShortRateR0: 0.02,
      speedOfReversionKappa: 0.1,
      longTermMeanTheta: 0.02,
      volatilitySigma: 0.15, // sigma^2 = 0.0225 > 2 * kappa * theta = 0.004
    };

    const result = engine.priceZeroCouponBond(violationParams, 2.0);
    expect(result.fellerConditionSatisfied).toBe(false);
    expect(result.fellerRatio).toBeLessThan(1.0);
  });

  it('should throw validation error on negative interest rate or non-positive maturity', () => {
    expect(() =>
      engine.priceZeroCouponBond({ ...standardParams, currentShortRateR0: -0.01 }, 1.0)
    ).toThrow('Current short rate cannot be negative in CIR model');

    expect(() => engine.priceZeroCouponBond(standardParams, 0)).toThrow(
      'Maturity must be positive'
    );
  });
});
