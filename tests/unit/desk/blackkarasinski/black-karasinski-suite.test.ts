import { describe, expect, it } from 'vitest';
import { BlackKarasinskiEngine } from '../../../../src/desk/blackkarasinski/black-karasinski-engine';
import { BkTrinomialTree } from '../../../../src/desk/blackkarasinski/black-karasinski-tree';
import {
  BkModelParameters,
  BkOptionSpec,
  BkYieldPoint,
} from '../../../../src/desk/blackkarasinski/black-karasinski-types';

describe('BlackKarasinskiEngine Suite (Desk 90)', () => {
  const engine = new BlackKarasinskiEngine();

  const standardYieldCurve: BkYieldPoint[] = [
    { maturityYears: 1.0, discountFactor: 0.95 },
    { maturityYears: 2.0, discountFactor: 0.90 },
    { maturityYears: 3.0, discountFactor: 0.85 },
  ];

  const standardParams: BkModelParameters = {
    meanReversionSpeed: 0.05,
    shortRateVolatility: 0.15,
  };

  it('should compute valid dx and trinomial branching probabilities summing to 1', () => {
    const dt = 0.5;
    const dx = BkTrinomialTree.calculateDx(standardParams.shortRateVolatility, dt);
    expect(dx).toBeGreaterThan(0.0);

    const branch0 = BkTrinomialTree.getBranchingProbabilities(0, standardParams.meanReversionSpeed, dt);
    expect(branch0.pu + branch0.pm + branch0.pd).toBeCloseTo(1.0, 4);

    const branchUp = BkTrinomialTree.getBranchingProbabilities(5, standardParams.meanReversionSpeed, dt);
    expect(branchUp.pu + branchUp.pm + branchUp.pd).toBeCloseTo(1.0, 4);
  });

  it('should calibrate tree to match market discount factors and guarantee positive rates', () => {
    const calib = engine.calibrate(
      standardYieldCurve,
      standardParams,
      { steps: 6, timeHorizonYears: 3.0 }
    );

    expect(calib.steps).toBe(6);
    expect(calib.alphas.length).toBe(6);

    for (let i = 0; i < calib.steps; i++) {
      const targetDF = calib.targetDiscountFactors[i]!;
      const fittedDF = calib.fittedDiscountFactors[i]!;
      expect(Math.abs(fittedDF - targetDF)).toBeLessThan(0.01);
      // In Black-Karasinski, short rate r = exp(alpha + j*dx) is strictly positive everywhere
      expect(Math.exp(calib.alphas[i]!)).toBeGreaterThan(0.0);
    }
  });

  it('should price European call and put bond options correctly', () => {
    const calib = engine.calibrate(
      standardYieldCurve,
      standardParams,
      { steps: 6, timeHorizonYears: 3.0 }
    );

    const callSpec: BkOptionSpec = {
      optionExpiryYears: 1.0,
      bondMaturityYears: 3.0,
      strikePrice: 88.0,
      isCall: true,
      faceValue: 100.0,
    };

    const putSpec: BkOptionSpec = {
      ...callSpec,
      isCall: false,
    };

    const callRes = engine.priceOption(calib, standardParams, callSpec);
    const putRes = engine.priceOption(calib, standardParams, putSpec);

    expect(callRes.optionPrice).toBeGreaterThanOrEqual(0.0);
    expect(putRes.optionPrice).toBeGreaterThanOrEqual(0.0);
    expect(callRes.underlyingBondPrice).toBeGreaterThan(0.0);
    expect(callRes.underlyingBondPrice).toBeLessThan(100.0);
  });

  it('should throw on invalid configuration or parameters', () => {
    expect(() =>
      engine.calibrate([], standardParams, { steps: 5, timeHorizonYears: 2.0 })
    ).toThrow('Yield curve must not be empty');

    expect(() =>
      engine.calibrate(standardYieldCurve, { ...standardParams, shortRateVolatility: -0.1 }, { steps: 5, timeHorizonYears: 2.0 })
    ).toThrow('Mean reversion speed must be >= 0 and sigma > 0');
  });
});
