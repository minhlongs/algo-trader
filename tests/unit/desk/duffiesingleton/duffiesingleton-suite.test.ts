/**
 * Duffie-Singleton (1999) Test Suite
 *
 * Validates analytical properties of the Recovery of Market Value model:
 * - RMV effective discounting: R = r + h * (1 - delta)
 * - Zero recovery equivalency to intensity survival discounting
 * - Full recovery (delta = 1) equivalency to risk-free bond
 * - Coupon-bearing bond cash flow pricing consistency
 * - Implied hazard rate calibration
 */

import { describe, it, expect } from 'vitest';
import { DuffieSingletonMath } from '../../../../src/desk/duffiesingleton/duffiesingleton-math';
import { DuffieSingletonEngine } from '../../../../src/desk/duffiesingleton/duffiesingleton-engine';
import type { DuffieSingletonConfig } from '../../../../src/desk/duffiesingleton/duffiesingleton-types';

describe('DuffieSingleton (1999) Suite', () => {
  const baseConfig: DuffieSingletonConfig = {
    riskFreeRate: 0.04,   // 4%
    hazardRate: 0.02,     // 200 bps
    recoveryRate: 0.40,   // 40% recovery
  };

  it('validates config bounds correctly', () => {
    expect(() => new DuffieSingletonEngine({ ...baseConfig, riskFreeRate: -0.01 })).toThrow();
    expect(() => new DuffieSingletonEngine({ ...baseConfig, hazardRate: -0.01 })).toThrow();
    expect(() => new DuffieSingletonEngine({ ...baseConfig, recoveryRate: 1.5 })).toThrow();
    expect(() => new DuffieSingletonEngine({ ...baseConfig, recoveryRate: -0.1 })).toThrow();
  });

  it('computes effective discount rate and credit spread in closed-form', () => {
    // R = r + h * (1 - delta) = 0.04 + 0.02 * (1 - 0.40) = 0.04 + 0.012 = 0.052
    const engine = new DuffieSingletonEngine(baseConfig);
    const estimates = engine.evaluate(5.0);

    expect(estimates.effectiveDiscountRate).toBeCloseTo(0.052, 6);
    expect(estimates.creditSpreadBps).toBeCloseTo(120, 4); // 0.012 = 120 bps
    expect(estimates.lossGivenDefault).toBeCloseTo(0.60, 6);
    expect(estimates.yieldToMaturity).toBeCloseTo(0.052, 6);
  });

  it('prices defaultable zero coupon bond correctly', () => {
    const engine = new DuffieSingletonEngine(baseConfig);
    const T = 3.0;
    const estimates = engine.evaluate(T, 100);

    // V(0, T) = 100 * exp(-0.052 * 3) = 100 * exp(-0.156) ≈ 85.5559
    const expected = 100 * Math.exp(-0.052 * 3.0);
    expect(estimates.defaultableZeroPrice).toBeCloseTo(expected, 4);
    expect(estimates.defaultableZeroPrice).toBeLessThan(estimates.riskFreeDiscount * 100);
  });

  it('reduces to risk-free pricing when recovery is 100%', () => {
    const fullRecoveryEngine = new DuffieSingletonEngine({
      ...baseConfig,
      recoveryRate: 1.0,
    });
    const estimates = fullRecoveryEngine.evaluate(5.0, 100);

    expect(estimates.effectiveDiscountRate).toBeCloseTo(0.04, 6);
    expect(estimates.creditSpreadBps).toBeCloseTo(0, 6);
    expect(estimates.defaultableZeroPrice).toBeCloseTo(100 * Math.exp(-0.04 * 5.0), 4);
  });

  it('prices coupon-bearing defaultable bond with discrete payments', () => {
    const engine = new DuffieSingletonEngine(baseConfig);
    const coupons = [
      { timeToPayment: 1.0, amount: 5 },
      { timeToPayment: 2.0, amount: 5 },
      { timeToPayment: 3.0, amount: 5 },
    ];
    const price = engine.priceCouponBond(coupons, 3.0, 100);

    const R = 0.052;
    const expectedCouponPV =
      5 * Math.exp(-R * 1.0) +
      5 * Math.exp(-R * 2.0) +
      5 * Math.exp(-R * 3.0);
    const expectedPrincipalPV = 100 * Math.exp(-R * 3.0);
    const expectedTotal = expectedCouponPV + expectedPrincipalPV;

    expect(price).toBeCloseTo(expectedTotal, 4);
  });

  it('calibrates hazard rate from observed spread accurately', () => {
    const spread = 0.015; // 150 bps
    const recovery = 0.40;
    const impliedHazard = DuffieSingletonMath.calibrateHazardRate(spread, recovery);

    // h = 0.015 / 0.60 = 0.025 (250 bps)
    expect(impliedHazard).toBeCloseTo(0.025, 6);
  });
});
