import { describe, expect, it } from 'vitest';
import { BjerksundBoundary } from '../../../../src/desk/bjerksund/bjerksund-boundary';
import { BjerksundEngine } from '../../../../src/desk/bjerksund/bjerksund-engine';
import { BjerksundParameters } from '../../../../src/desk/bjerksund/bjerksund-types';

describe('BjerksundEngine Suite (Desk 89)', () => {
  const engine = new BjerksundEngine();

  const standardCallParams: BjerksundParameters = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 1.0,
    riskFreeRatePct: 8.0,
    continuousDividendYieldPct: 4.0,
    volatilityPct: 25.0,
    optionType: 'CALL',
  };

  const standardPutParams: BjerksundParameters = {
    ...standardCallParams,
    optionType: 'PUT',
  };

  it('should calculate valid trigger boundaries and beta exponent', () => {
    const beta = BjerksundBoundary.calculateBeta(0.08, 0.04, 0.25 * 0.25);
    expect(beta).toBeGreaterThan(1.0);

    const boundaries = BjerksundBoundary.calculateBoundaries(
      100.0,
      1.0,
      0.08,
      0.04,
      0.25,
      beta
    );

    expect(boundaries.I1).toBeGreaterThan(100.0);
    expect(boundaries.I2).toBeGreaterThanOrEqual(boundaries.I1);
    expect(boundaries.t1).toBeGreaterThan(0.0);
    expect(boundaries.t1).toBeLessThan(1.0);
  });

  it('should price American Call and Put with early exercise premium', () => {
    const callRes = engine.priceAmericanOption(standardCallParams);
    expect(callRes.americanPrice).toBeGreaterThanOrEqual(callRes.europeanPrice);
    expect(callRes.earlyExercisePremium).toBeGreaterThanOrEqual(0.0);
    expect(callRes.triggerBoundaryI2).toBeGreaterThan(standardCallParams.strikePrice);

    const putRes = engine.priceAmericanOption(standardPutParams);
    expect(putRes.americanPrice).toBeGreaterThanOrEqual(putRes.europeanPrice);
    expect(putRes.earlyExercisePremium).toBeGreaterThanOrEqual(0.0);
  });

  it('should equal European price when dividend is zero or negative for Call', () => {
    const zeroDivCall: BjerksundParameters = {
      ...standardCallParams,
      continuousDividendYieldPct: 0.0,
    };

    const res = engine.priceAmericanOption(zeroDivCall);
    expect(res.americanPrice).toBeCloseTo(res.europeanPrice, 4);
    expect(res.earlyExercisePremium).toBe(0.0);
  });

  it('should throw on non-positive input values', () => {
    expect(() =>
      engine.priceAmericanOption({
        ...standardCallParams,
        spotPrice: -100.0,
      })
    ).toThrow('Spot and strike prices must be positive');

    expect(() =>
      engine.priceAmericanOption({
        ...standardCallParams,
        volatilityPct: 0.0,
      })
    ).toThrow('Volatility must be positive');
  });
});
