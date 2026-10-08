import { describe, expect, it } from 'vitest';
import { BawEngine } from '../../../../src/desk/baw/baw-engine';
import { BawOptionParameters } from '../../../../src/desk/baw/baw-types';

describe('BawEngine Suite (Desk 86)', () => {
  const engine = new BawEngine();

  const standardCallParams: BawOptionParameters = {
    spotPrice: 100.0,
    strikePrice: 100.0,
    timeToExpiryYears: 0.5,
    riskFreeRatePct: 8.0,
    continuousDividendYieldPct: 4.0, // Continuous dividend 4%
    volatilityPct: 25.0,
    optionType: 'CALL',
  };

  const standardPutParams: BawOptionParameters = {
    ...standardCallParams,
    optionType: 'PUT',
  };

  it('should price American Call with early exercise premium due to dividend', () => {
    const res = engine.priceAmericanOption(standardCallParams);

    expect(res.americanPrice).toBeGreaterThanOrEqual(res.europeanPrice);
    expect(res.earlyExercisePremium).toBeGreaterThanOrEqual(0.0);
    expect(res.criticalSpotPrice).toBeGreaterThan(standardCallParams.strikePrice);
    expect(res.qExponent).toBeGreaterThan(1.0);
    expect(res.iterations).toBeGreaterThan(0);
  });

  it('should price American Put with early exercise premium', () => {
    const res = engine.priceAmericanOption(standardPutParams);

    expect(res.americanPrice).toBeGreaterThan(res.europeanPrice);
    expect(res.earlyExercisePremium).toBeGreaterThan(0.0);
    expect(res.criticalSpotPrice).toBeLessThan(standardPutParams.strikePrice);
    expect(res.qExponent).toBeLessThan(0.0);
    expect(res.iterations).toBeGreaterThan(0);
  });

  it('should equal European Call price when dividend yield is zero or negative', () => {
    const zeroDivCall: BawOptionParameters = {
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
        spotPrice: -50.0,
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
