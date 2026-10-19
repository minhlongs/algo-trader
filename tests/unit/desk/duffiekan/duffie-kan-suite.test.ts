import { describe, it, expect } from 'vitest';
import { DuffieKanEngine } from '../../../../src/desk/duffiekan/duffie-kan-engine.js';
import { DuffieKanParams } from '../../../../src/desk/duffiekan/duffie-kan-types.js';

describe('Duffie-Kan (1996) Affine Term Structure Rate & Credit Engine', () => {
  const oneFactorParams: DuffieKanParams = {
    speedK: [0.15],
    theta: [0.05],
    sigma: [0.02],
    delta0: 0.0,
    delta1: [1.0],
    stateX: [0.04],
    maturity: 5.0,
  };

  it('prices zero-coupon bond and verifies monotonic discount decay', () => {
    const res = DuffieKanEngine.price(oneFactorParams);
    expect(res.bondPrice).toBeGreaterThan(0);
    expect(res.bondPrice).toBeLessThan(1.0);
    expect(res.yieldToMaturity).toBeGreaterThan(0.03);
    expect(res.yieldToMaturity).toBeLessThan(0.06);
    expect(res.coefficientsB[0]).toBeLessThan(0);
  });

  it('solves two-factor term structure with coupled state variables', () => {
    const twoFactorParams: DuffieKanParams = {
      speedK: [0.2, 0.08],
      theta: [0.03, 0.02],
      sigma: [0.015, 0.01],
      delta0: 0.01,
      delta1: [0.8, 0.5],
      stateX: [0.025, 0.015],
      maturity: 10.0,
    };
    const res = DuffieKanEngine.price(twoFactorParams);
    expect(res.coefficientsB.length).toBe(2);
    expect(res.coefficientsB[0]).toBeLessThan(0);
    expect(res.coefficientsB[1]).toBeLessThan(0);
    expect(res.bondPrice).toBeGreaterThan(0.4);
    expect(res.bondPrice).toBeLessThan(0.9);
  });

  it('incorporates default intensity and computes positive credit spread', () => {
    const creditParams: DuffieKanParams = {
      ...oneFactorParams,
      creditDelta0: 0.01,
      creditDelta1: [0.5],
      recoveryRate: 0.4,
    };
    const res = DuffieKanEngine.price(creditParams);
    expect(res.defaultablePrice).toBeDefined();
    expect(res.defaultablePrice!).toBeLessThan(res.bondPrice);
    expect(res.creditSpreadBps).toBeGreaterThan(50);
    expect(res.creditSpreadBps).toBeLessThan(400);
  });

  it('expands credit spread when recovery rate decreases', () => {
    const highRecovery: DuffieKanParams = {
      ...oneFactorParams,
      creditDelta0: 0.02,
      recoveryRate: 0.6,
    };
    const lowRecovery: DuffieKanParams = {
      ...oneFactorParams,
      creditDelta0: 0.02,
      recoveryRate: 0.2,
    };
    const resHigh = DuffieKanEngine.price(highRecovery);
    const resLow = DuffieKanEngine.price(lowRecovery);

    expect(resLow.creditSpreadBps).toBeGreaterThan(resHigh.creditSpreadBps);
  });

  it('generates multi-maturity term structure curves', () => {
    const maturities = [1, 2, 5, 10];
    const curve = DuffieKanEngine.termStructure(oneFactorParams, maturities);
    expect(curve.length).toBe(4);
    expect(curve[0].maturity).toBe(1);
    expect(curve[3].maturity).toBe(10);
    expect(curve[0].yield).toBeGreaterThan(0);
  });

  it('validates input dimensions and boundaries strictly', () => {
    expect(() =>
      DuffieKanEngine.price({ ...oneFactorParams, theta: [0.05, 0.02] })
    ).toThrow(/Inconsistent dimension/);

    expect(() =>
      DuffieKanEngine.price({ ...oneFactorParams, maturity: -2 })
    ).toThrow(/strictly positive/);

    expect(() =>
      DuffieKanEngine.price({ ...oneFactorParams, speedK: [-0.1] })
    ).toThrow(/positive/);
  });
});
