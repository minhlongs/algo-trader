import { describe, it, expect } from 'vitest';
import { RubinsteinEngine } from '../../../../src/desk/rubinstein/rubinstein-engine';
import { RubinsteinParams } from '../../../../src/desk/rubinstein/rubinstein-types';

describe('Desk 123: Rubinstein (1994) Implied Binomial Tree Engine', () => {
  const baseParams: RubinsteinParams = {
    spotPrice: 100.0,
    riskFreeRate: 0.05,
    dividendYield: 0.02,
    timeToMaturity: 1.0,
    steps: 20,
    volatilityPrior: 0.20,
    marketQuotes: [
      { strike: 90.0, marketPrice: 16.5, optionType: 'call' },
      { strike: 100.0, marketPrice: 9.8, optionType: 'call' },
      { strike: 110.0, marketPrice: 5.2, optionType: 'call' },
    ],
  };

  it('generates non-negative implied terminal probabilities summing to unity', () => {
    const res = RubinsteinEngine.calibrate(baseParams);

    expect(res.terminalNodes.length).toBe(baseParams.steps + 1);

    let sumProb = 0.0;
    for (const node of res.terminalNodes) {
      expect(node.impliedProb).toBeGreaterThanOrEqual(0.0);
      expect(node.spotPrice).toBeGreaterThan(0.0);
      sumProb += node.impliedProb;
    }

    expect(sumProb).toBeCloseTo(1.0, 5);
  });

  it('satisfies the risk-neutral martingale condition within tight numerical tolerance', () => {
    const res = RubinsteinEngine.calibrate(baseParams);

    const expectedForward = baseParams.spotPrice * Math.exp((baseParams.riskFreeRate - baseParams.dividendYield) * baseParams.timeToMaturity);
    expect(res.forwardPrice).toBeCloseTo(expectedForward, 6);
    expect(res.martingaleError).toBeLessThan(0.5);
  });

  it('fits market option smile quotes with low residual fitting error', () => {
    const res = RubinsteinEngine.calibrate(baseParams);

    for (const metric of res.fitMetrics) {
      expect(Math.abs(metric.error)).toBeLessThan(1.5);
      expect(metric.modelPrice).toBeGreaterThan(0.0);
    }
    expect(res.maxAbsFittingError).toBeLessThan(1.5);
  });

  it('computes non-negative Kullback-Leibler divergence relative to lognormal prior', () => {
    const res = RubinsteinEngine.calibrate(baseParams);

    expect(res.entropyDivergence).toBeGreaterThanOrEqual(0.0);
  });

  it('throws validation error on invalid input parameters', () => {
    expect(() =>
      RubinsteinEngine.calibrate({ ...baseParams, spotPrice: -50 })
    ).toThrow(/Spot price must be positive/);

    expect(() =>
      RubinsteinEngine.calibrate({ ...baseParams, steps: 1 })
    ).toThrow(/Binomial steps must be between 2 and 200/);

    expect(() =>
      RubinsteinEngine.calibrate({ ...baseParams, marketQuotes: [] })
    ).toThrow(/At least one market option quote is required/);
  });
});
