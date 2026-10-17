import { describe, expect, it } from 'vitest';
import { VasicekCopulaEngine, VasicekPortfolioConfig } from '../../../../src/desk/vasicekcopula';

describe('VasicekCopulaEngine (2002 ASRF Credit Risk Copula)', () => {
  const engine = new VasicekCopulaEngine();

  it('correctly calculates Basel II/III regulatory capital metrics', () => {
    const config: VasicekPortfolioConfig = {
      defaultProbabilityPct: 1.0, // 1% PD
      lossGivenDefaultPct: 45.0,  // 45% LGD
      assetCorrelation: 0.20,     // 20% correlation
      totalExposureUsd: 10_000_000,
      confidenceLevelPct: 99.9,
    };

    const result = engine.evaluate(config);

    // Expected Loss = 1% * 45% = 0.45%
    expect(result.expectedLossPct).toBeCloseTo(0.45, 2);
    expect(result.expectedLossUsd).toBeCloseTo(45_000, 0);

    // 99.9% VaR must exceed Expected Loss significantly due to tail correlation
    expect(result.creditVarPct).toBeGreaterThan(result.expectedLossPct);
    expect(result.unexpectedLossPct).toBeGreaterThan(0);
    expect(result.unexpectedLossUsd).toBe(result.creditVarUsd - result.expectedLossUsd);

    // Expected Shortfall (CVaR) must exceed Value-at-Risk
    expect(result.expectedShortfallPct).toBeGreaterThanOrEqual(result.creditVarPct);

    // Verify default threshold score is negative for PD < 50%
    expect(result.defaultThresholdScore).toBeLessThan(0);
  });

  it('increases tail risk as asset correlation rho increases', () => {
    const baseConfig: VasicekPortfolioConfig = {
      defaultProbabilityPct: 2.0,
      lossGivenDefaultPct: 50.0,
      assetCorrelation: 0.10,
      confidenceLevelPct: 99.9,
    };

    const resLowCorr = engine.evaluate(baseConfig);
    const resHighCorr = engine.evaluate({ ...baseConfig, assetCorrelation: 0.35 });

    // Higher systematic correlation thickens the portfolio loss tail
    expect(resHighCorr.creditVarPct).toBeGreaterThan(resLowCorr.creditVarPct);
    expect(resHighCorr.unexpectedLossPct).toBeGreaterThan(resLowCorr.unexpectedLossPct);
  });

  it('generates a strictly monotonic cumulative loss distribution sample', () => {
    const config: VasicekPortfolioConfig = {
      defaultProbabilityPct: 1.5,
      lossGivenDefaultPct: 40.0,
      assetCorrelation: 0.15,
    };

    const result = engine.evaluate(config);

    expect(result.distributionSample.length).toBeGreaterThan(5);
    for (let i = 1; i < result.distributionSample.length; i++) {
      const prev = result.distributionSample[i - 1]!;
      const curr = result.distributionSample[i]!;
      expect(curr.cumulativeProbability).toBeGreaterThanOrEqual(prev.cumulativeProbability);
    }
  });

  it('validates input ranges and throws descriptive errors', () => {
    expect(() => engine.evaluate({
      defaultProbabilityPct: 0,
      lossGivenDefaultPct: 40,
      assetCorrelation: 0.15,
    })).toThrow('Default probability must be strictly between 0 and 100%');

    expect(() => engine.evaluate({
      defaultProbabilityPct: 1,
      lossGivenDefaultPct: 150,
      assetCorrelation: 0.15,
    })).toThrow('Loss Given Default must be in (0, 100]%');

    expect(() => engine.evaluate({
      defaultProbabilityPct: 1,
      lossGivenDefaultPct: 40,
      assetCorrelation: 1.05,
    })).toThrow('Asset correlation rho must be strictly in (0, 1)');
  });
});
