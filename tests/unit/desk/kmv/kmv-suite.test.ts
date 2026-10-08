import { describe, expect, it } from 'vitest';
import { KmvEngine } from '../../../../src/desk/kmv/kmv-engine';
import { KmvParams } from '../../../../src/desk/kmv/kmv-types';
import { KmvMath } from '../../../../src/desk/kmv/kmv-math';

describe('Merton-KMV (1974) Structural Credit Risk Suite (Desk 115)', () => {
  const baseParams: KmvParams = {
    equityValue: 100.0,       // $100M market cap
    equityVolatility: 0.35,   // 35% equity vol
    debtFaceValue: 80.0,      // $80M debt default point
    timeHorizon: 1.0,         // 1-year horizon
    riskFreeRate: 0.05,       // 5% risk-free rate
    assetDrift: 0.08,         // 8% asset drift
  };

  it('should calibrate asset value and volatility satisfying Merton structural equations', () => {
    const result = KmvEngine.calculate(baseParams);

    expect(result.assetValue).toBeGreaterThan(baseParams.equityValue);
    expect(result.assetVolatility).toBeLessThan(baseParams.equityVolatility);
    expect(result.assetVolatility).toBeGreaterThan(0.05);
    expect(result.distanceToDefault).toBeGreaterThan(1.5);
    expect(result.expectedDefaultFrequency).toBeLessThan(0.10);
    expect(result.expectedDefaultFrequency).toBeGreaterThan(0.0);
    expect(result.riskyDebtValue).toBeGreaterThan(0.0);
    expect(result.riskyDebtValue).toBeLessThan(baseParams.debtFaceValue);
    expect(result.creditSpreadBps).toBeGreaterThan(0.0);
    expect(result.leverageRatio).toBeLessThan(1.0);
  });

  it('should increase default frequency and widen credit spread for distressed firms', () => {
    const healthyResult = KmvEngine.calculate(baseParams);
    const distressedParams: KmvParams = {
      ...baseParams,
      equityValue: 20.0,
      debtFaceValue: 100.0,
      equityVolatility: 0.70,
    };
    const distressedResult = KmvEngine.calculate(distressedParams);

    expect(distressedResult.distanceToDefault).toBeLessThan(healthyResult.distanceToDefault);
    expect(distressedResult.expectedDefaultFrequency).toBeGreaterThan(healthyResult.expectedDefaultFrequency);
    expect(distressedResult.creditSpreadBps).toBeGreaterThan(healthyResult.creditSpreadBps);
    expect(distressedResult.leverageRatio).toBeGreaterThan(healthyResult.leverageRatio);
  });

  it('should throw error when inputs are non-positive', () => {
    expect(() => KmvEngine.calculate({ ...baseParams, equityValue: 0 })).toThrow(/must be strictly positive/i);
    expect(() => KmvEngine.calculate({ ...baseParams, debtFaceValue: -10 })).toThrow(/must be strictly positive/i);
    expect(() => KmvEngine.calculate({ ...baseParams, timeHorizon: 0 })).toThrow(/must be strictly positive/i);
  });

  it('should compute standard normal CDF and PDF accurately', () => {
    expect(KmvMath.normalCdf(0.0)).toBeCloseTo(0.5, 5);
    expect(KmvMath.normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(KmvMath.normalPdf(0.0)).toBeCloseTo(1.0 / Math.sqrt(2 * Math.PI), 5);
  });
});
