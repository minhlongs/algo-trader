import { describe, it, expect } from 'vitest';
import { CirEngine } from '../../../../src/desk/circredit/cir-engine.js';
import { CirModelParams } from '../../../../src/desk/circredit/cir-types.js';

describe('Cox-Ingersoll-Ross (1985) Square-Root Diffusion Term Structure & Credit Engine', () => {
  const baseParams: CirModelParams = {
    factors: [
      {
        speedKappa: 0.8,
        meanTheta: 0.05,
        sigma: 0.1, // 2*k*theta = 0.08 > sigma^2 = 0.01 (Feller strictly met)
        currentX: 0.04,
        rateWeight: 1.0,
        defaultWeight: 0.5,
      },
    ],
    baseRate: 0.01,
    baseDefaultIntensity: 0.02,
    recoveryRate: 0.40,
  };

  it('prices riskless zero-coupon bond decreasing strictly with maturity', () => {
    const res1 = CirEngine.priceBond(baseParams, 1.0);
    const res5 = CirEngine.priceBond(baseParams, 5.0);

    expect(res1.risklessPrice).toBeGreaterThan(res5.risklessPrice);
    expect(res1.risklessPrice).toBeLessThan(1.0);
    expect(res5.risklessPrice).toBeGreaterThan(0.0);
  });

  it('generates strictly positive credit spread widening for positive default intensity', () => {
    const res = CirEngine.priceBond(baseParams, 3.0);
    expect(res.creditSpreadBps).toBeGreaterThan(50); // Significant credit spread
    expect(res.defaultablePrice).toBeLessThan(res.risklessPrice);
    expect(res.defaultableYield).toBeGreaterThan(res.risklessYield);
    expect(res.survivalProbability).toBeLessThan(1.0);
  });

  it('narrows credit spread when recovery rate approaches 100%', () => {
    const lowRecovery = CirEngine.priceBond({ ...baseParams, recoveryRate: 0.10 }, 2.0);
    const highRecovery = CirEngine.priceBond({ ...baseParams, recoveryRate: 0.90 }, 2.0);

    expect(lowRecovery.creditSpreadBps).toBeGreaterThan(highRecovery.creditSpreadBps);
    expect(highRecovery.defaultablePrice).toBeGreaterThan(lowRecovery.defaultablePrice);
  });

  it('constructs multi-factor credit spread curves', () => {
    const twoFactorParams: CirModelParams = {
      ...baseParams,
      factors: [
        baseParams.factors[0],
        {
          speedKappa: 1.5,
          meanTheta: 0.03,
          sigma: 0.08,
          currentX: 0.02,
          rateWeight: 0.5,
          defaultWeight: 1.0,
        },
      ],
    };

    const maturities = [0.5, 1.0, 2.0, 5.0, 10.0];
    const curve = CirEngine.buildCurve(twoFactorParams, maturities);

    expect(curve.curve.length).toBe(5);
    expect(curve.curve[0].tau).toBe(0.5);
    expect(curve.curve[4].tau).toBe(10.0);
    expect(curve.curve[4].survivalProbability).toBeLessThan(curve.curve[0].survivalProbability);
  });

  it('validates boundaries and non-negative constraints', () => {
    expect(() => CirEngine.priceBond({ ...baseParams, recoveryRate: 1.2 }, 1.0)).toThrow(/recovery rate/i);
    expect(() => CirEngine.priceBond({ ...baseParams, factors: [] }, 1.0)).toThrow(/non-empty/i);
    expect(() => CirEngine.priceBond(baseParams, -0.5)).toThrow(/strictly positive/i);
  });
});
