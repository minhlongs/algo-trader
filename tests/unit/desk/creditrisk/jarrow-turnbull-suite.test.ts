import { describe, expect, it } from 'vitest';
import { JarrowTurnbullEngine } from '../../../../src/desk/creditrisk/jarrow-turnbull-engine';
import { DefaultableBondParams } from '../../../../src/desk/creditrisk/jarrow-turnbull-types';

describe('Jarrow-Turnbull (1995) Reduced-Form Credit Risk (Desk 102)', () => {
  it('should price a default-free zero coupon bond correctly when hazard rate is 0', () => {
    const params: DefaultableBondParams = {
      faceValue: 100,
      timeToMaturity: 1.0,
      riskFreeRate: 0.05,
      hazardRate: 0.0,
      recoveryRate: 0.4
    };
    
    const metrics = JarrowTurnbullEngine.calculateDefaultableBond(params);
    expect(metrics.survivalProbability).toBe(1.0);
    expect(metrics.defaultProbability).toBe(0.0);
    expect(metrics.expectedLoss).toBeCloseTo(0.0, 6);
    expect(metrics.creditSpread).toBeCloseTo(0.0, 6);
    expect(metrics.bondPrice).toBeCloseTo(params.faceValue * Math.exp(-0.05 * 1.0), 6);
    expect(metrics.riskFreePrice).toBeCloseTo(metrics.bondPrice, 6);
  });

  it('should correctly price a defaultable zero coupon bond and generate expected credit spread', () => {
    const params: DefaultableBondParams = {
      faceValue: 100,
      timeToMaturity: 2.0,
      riskFreeRate: 0.03,
      hazardRate: 0.02, // 2% default intensity
      recoveryRate: 0.4 // 40% recovery
    };
    
    const metrics = JarrowTurnbullEngine.calculateDefaultableBond(params);
    const expectedSurvival = Math.exp(-0.04);
    
    expect(metrics.survivalProbability).toBeCloseTo(expectedSurvival, 6);
    expect(metrics.defaultProbability).toBeCloseTo(1.0 - expectedSurvival, 6);
    
    // Spread for a ZCB approximately equals lambda * (1 - R) via Taylor expansion
    expect(metrics.creditSpread).toBeCloseTo(0.02 * (1.0 - 0.4), 2);
    
    // Bond Price P_d = P_f * (S + R * (1-S))
    const pF = 100 * Math.exp(-0.06);
    const pD = pF * (expectedSurvival + 0.4 * (1.0 - expectedSurvival));
    expect(metrics.bondPrice).toBeCloseTo(pD, 6);
    expect(metrics.expectedLoss).toBeCloseTo(pF - pD, 6);
  });

  it('should price a defaultable coupon bond with periodic payments', () => {
    const params: DefaultableBondParams = {
      faceValue: 100,
      timeToMaturity: 3.0,
      riskFreeRate: 0.04,
      hazardRate: 0.05,
      recoveryRate: 0.3,
      couponRate: 0.06,
      paymentFrequency: 2 // Semi-annual
    };
    
    const metrics = JarrowTurnbullEngine.calculateDefaultableBond(params);
    // Bond price should be lower than risk-free rate
    expect(metrics.bondPrice).toBeLessThan(metrics.riskFreePrice);
    expect(metrics.creditSpread).toBeGreaterThan(0.0);
    
    // 6 payments expected over 3 years
    // The credit spread roughly approximates lambda * (1 - R) = 0.05 * 0.7 = 0.035
    expect(metrics.creditSpread).toBeCloseTo(0.035, 2);
  });
});
