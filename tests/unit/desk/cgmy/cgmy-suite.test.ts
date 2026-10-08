import { describe, expect, it } from 'vitest';
import { CgmyEngine } from '../../../../src/desk/cgmy/cgmy-engine';
import { CgmyParams } from '../../../../src/desk/cgmy/cgmy-types';
import { CgmyMath } from '../../../../src/desk/cgmy/cgmy-math';

describe('CGMY (2002) Pure Jump Lévy Option Engine (Desk 114)', () => {
  const baseParams: CgmyParams = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToMaturity: 1.0,
    riskFreeRate: 0.05,
    dividendYield: 0.0,
    c: 0.5,
    g: 2.0,
    m: 3.5,
    y: 0.5,
    isCall: true,
  };

  it('should price European Call with positive fair value and moments', () => {
    const result = CgmyEngine.calculate(baseParams);

    expect(result.price).toBeGreaterThan(0.0);
    expect(result.price).toBeGreaterThan(5.0);
    expect(result.price).toBeLessThan(25.0);
    expect(result.variance).toBeGreaterThan(0.0);
    expect(result.kurtosis).toBeGreaterThan(0.0);
    expect(result.martingaleCorrection).toBeDefined();
  });

  it('should satisfy Put-Call parity in CGMY model', () => {
    const callResult = CgmyEngine.calculate(baseParams);
    const putResult = CgmyEngine.calculate({ ...baseParams, isCall: false });

    const expectedDiff = baseParams.spotPrice - baseParams.strikePrice * Math.exp(-baseParams.riskFreeRate * baseParams.timeToMaturity);
    const actualDiff = callResult.price - putResult.price;

    expect(actualDiff).toBeCloseTo(expectedDiff, 1);
  });

  it('should throw an error when martingale restriction m > 1 is violated', () => {
    expect(() => CgmyEngine.calculate({ ...baseParams, m: 0.8 })).toThrow(/m must be strictly greater than 1/i);
  });

  it('should throw an error when fine structure index y is outside (0, 2) or equal to 1.0', () => {
    expect(() => CgmyEngine.calculate({ ...baseParams, y: 1.0 })).toThrow(/Parameter y must be in \(0, 2\) and not equal to 1.0/i);
    expect(() => CgmyEngine.calculate({ ...baseParams, y: 2.5 })).toThrow(/Parameter y must be in \(0, 2\)/i);
  });

  it('should accurately calculate Gamma function values', () => {
    expect(CgmyMath.gamma(1.0)).toBeCloseTo(1.0, 4);
    expect(CgmyMath.gamma(2.0)).toBeCloseTo(1.0, 4);
    expect(CgmyMath.gamma(3.0)).toBeCloseTo(2.0, 4);
    expect(CgmyMath.gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 4);
  });
});
