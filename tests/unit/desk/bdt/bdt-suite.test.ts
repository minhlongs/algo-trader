import { describe, expect, it } from 'vitest';
import { BdtEngine } from '../../../../src/desk/bdt/bdt-engine';
import { BdtBondOptionSpec, BdtYieldPoint } from '../../../../src/desk/bdt/bdt-types';

describe('BdtEngine Suite (Desk 81)', () => {
  const engine = new BdtEngine();

  const standardYieldCurve: BdtYieldPoint[] = [
    { maturityYears: 1.0, discountFactor: 0.96, rateVolatility: 0.15 },
    { maturityYears: 2.0, discountFactor: 0.92, rateVolatility: 0.16 },
    { maturityYears: 3.0, discountFactor: 0.87, rateVolatility: 0.17 },
  ];

  it('should calibrate BDT tree and exactly match target discount factors', () => {
    const calib = engine.calibrateTree(standardYieldCurve, 6, 3.0);

    expect(calib.steps).toBe(6);
    expect(calib.baselineRates.length).toBe(6);
    expect(calib.volatilities.length).toBe(6);

    for (let i = 0; i < calib.steps; i++) {
      expect(calib.baselineRates[i]).toBeGreaterThan(0.0);
      const targetDF = calib.discountFactorsTarget[i]!;
      const fittedDF = calib.discountFactorsFitted[i]!;
      expect(Math.abs(fittedDF - targetDF)).toBeLessThan(0.001);
    }
  });

  it('should price European call and put bond options with positive prices', () => {
    const calib = engine.calibrateTree(standardYieldCurve, 6, 3.0);

    const callSpec: BdtBondOptionSpec = {
      optionExpiryYears: 1.0,
      bondMaturityYears: 3.0,
      strikePriceUsd: 88.0,
      faceValueUsd: 100.0,
      isCall: true,
    };

    const putSpec: BdtBondOptionSpec = {
      ...callSpec,
      isCall: false,
    };

    const callRes = engine.priceBondOption(calib, callSpec);
    const putRes = engine.priceBondOption(calib, putSpec);

    expect(callRes.optionPriceUsd).toBeGreaterThanOrEqual(0.0);
    expect(putRes.optionPriceUsd).toBeGreaterThanOrEqual(0.0);
    expect(callRes.underlyingBondPriceUsd).toBeGreaterThan(80.0);
    expect(callRes.underlyingBondPriceUsd).toBeLessThan(100.0);
    expect(callRes.forwardBondPriceUsd).toBeGreaterThan(0.0);
  });

  it('should throw when input parameters are invalid', () => {
    expect(() => engine.calibrateTree([], 5, 2.0)).toThrow('Yield curve must not be empty');
    expect(() => engine.calibrateTree(standardYieldCurve, 0, 2.0)).toThrow('Steps must be between 1 and 100');
    expect(() => engine.calibrateTree(standardYieldCurve, 5, -1.0)).toThrow('Time horizon must be positive');
  });
});
