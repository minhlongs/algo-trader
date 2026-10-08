import { describe, expect, it } from 'vitest';
import { BlackCoxEngine } from '../../../../src/desk/blackcox/black-cox-engine';
import { BlackCoxParams } from '../../../../src/desk/blackcox/black-cox-types';
import { BlackCoxMath } from '../../../../src/desk/blackcox/black-cox-math';

describe('Black-Cox (1976) First-Passage Structural Credit Suite (Desk 111)', () => {
  const baseParams: BlackCoxParams = {
    assetValue: 100,           // V0 = 100
    defaultThreshold: 60,      // K = 60
    growthRate: 0.05,          // r = 5%
    volatility: 0.25,          // sigma = 25%
    barrierDiscountRate: 0.02, // gamma = 2%
    timeHorizon: 5.0,          // T = 5 years
    recoveryRate: 0.40,        // R = 40%
  };

  it('should calculate valid survival probability and credit spread', () => {
    const result = BlackCoxEngine.calculate(baseParams);

    expect(result.survivalProbability).toBeGreaterThan(0.5);
    expect(result.survivalProbability).toBeLessThan(1.0);
    expect(result.defaultProbability).toBeCloseTo(1.0 - result.survivalProbability, 6);
    expect(result.creditSpreadBps).toBeGreaterThan(0.0);
    expect(result.expectedRecoveryValue).toBeGreaterThan(0.0);
  });

  it('should increase default probability and credit spread when volatility increases', () => {
    const lowVolResult = BlackCoxEngine.calculate({ ...baseParams, volatility: 0.15 });
    const highVolResult = BlackCoxEngine.calculate({ ...baseParams, volatility: 0.35 });

    expect(highVolResult.defaultProbability).toBeGreaterThan(lowVolResult.defaultProbability);
    expect(highVolResult.creditSpreadBps).toBeGreaterThan(lowVolResult.creditSpreadBps);
  });

  it('should trigger immediate default if initial assets are below threshold barrier', () => {
    const insolventParams: BlackCoxParams = {
      ...baseParams,
      assetValue: 50,
      defaultThreshold: 60,
      barrierDiscountRate: 0.0, // barrier = 60 > assetValue 50
    };

    const result = BlackCoxEngine.calculate(insolventParams);
    expect(result.survivalProbability).toBe(0.0);
    expect(result.defaultProbability).toBe(1.0);
    expect(result.expectedRecoveryValue).toBe(baseParams.recoveryRate * insolventParams.defaultThreshold);
    expect(result.creditSpreadBps).toBe(10000.0);
  });

  it('should accurately compute normal CDF helper', () => {
    expect(BlackCoxMath.normalCdf(0.0)).toBeCloseTo(0.5, 5);
    expect(BlackCoxMath.normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });
});
