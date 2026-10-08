import { describe, expect, it } from 'vitest';
import { HestonPricingEngine } from '../../../../src/desk/heston/heston-pricing-engine';
import { HestonModelParameters, OptionTerms } from '../../../../src/desk/heston/heston-types';

describe('HestonPricingEngine Suite (Desk 77)', () => {
  const engine = new HestonPricingEngine();

  // Benchmark parameters: S0 = 100, K = 100, tau = 1 yr, r = 3%, q = 0%
  // v0 = 0.04 (initial vol = 20%), kappa = 1.5, theta = 0.04, sigma = 0.3, rho = -0.7
  // Feller: 2 * kappa * theta = 2 * 1.5 * 0.04 = 0.12 > sigma^2 = 0.09 (Satisfied)
  const standardParams: HestonModelParameters = {
    spotPrice: 100.0,
    initialVariance: 0.04,
    kappa: 1.5,
    theta: 0.04,
    sigmaVolOfVol: 0.3,
    rho: -0.7,
    riskFreeRatePct: 3.0,
    dividendYieldPct: 0.0,
  };

  const atmTerms: OptionTerms = {
    strikePrice: 100.0,
    timeToExpiryYears: 1.0,
  };

  it('should price ATM European call and put options and verify put-call parity', () => {
    const result = engine.priceOption(standardParams, atmTerms);

    expect(result.callPriceUsd).toBeGreaterThan(5.0);
    expect(result.callPriceUsd).toBeLessThan(15.0);
    expect(result.putPriceUsd).toBeGreaterThan(2.0);
    expect(result.putPriceUsd).toBeLessThan(12.0);
    expect(result.probabilityP1).toBeGreaterThan(0.0);
    expect(result.probabilityP1).toBeLessThan(1.0);
    expect(result.probabilityP2).toBeGreaterThan(0.0);
    expect(result.probabilityP2).toBeLessThan(1.0);
    expect(result.fellerSatisfied).toBe(true);

    // Put-Call Parity check: C - P = S0 * e^(-q*tau) - K * e^(-r*tau)
    const forwardDiff =
      standardParams.spotPrice * Math.exp(-0.0 * 1.0) -
      atmTerms.strikePrice * Math.exp(-0.03 * 1.0);
    const priceDiff = result.callPriceUsd - result.putPriceUsd;

    expect(Math.abs(priceDiff - forwardDiff)).toBeLessThan(0.01);
  });

  it('should price ITM call higher than OTM call', () => {
    const itmTerms: OptionTerms = { strikePrice: 90.0, timeToExpiryYears: 1.0 };
    const otmTerms: OptionTerms = { strikePrice: 110.0, timeToExpiryYears: 1.0 };

    const itmResult = engine.priceOption(standardParams, itmTerms);
    const otmResult = engine.priceOption(standardParams, otmTerms);

    expect(itmResult.callPriceUsd).toBeGreaterThan(otmResult.callPriceUsd);
    expect(otmResult.putPriceUsd).toBeGreaterThan(itmResult.putPriceUsd);
  });

  it('should throw error on invalid inputs', () => {
    expect(() =>
      engine.priceOption({ ...standardParams, spotPrice: -10 }, atmTerms)
    ).toThrow('Prices and expiry must be positive');

    expect(() =>
      engine.priceOption(standardParams, { ...atmTerms, timeToExpiryYears: 0 })
    ).toThrow('Prices and expiry must be positive');
  });
});
