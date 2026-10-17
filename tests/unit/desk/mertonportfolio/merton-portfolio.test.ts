import { describe, expect, it } from 'vitest';
import { MertonPortfolioEngine, MertonPortfolioConfig } from '../../../../src/desk/mertonportfolio';

describe('MertonPortfolioEngine (1971 Optimal Portfolio & Consumption)', () => {
  const engine = new MertonPortfolioEngine();

  it('correctly calculates optimal Merton fraction (mu - r) / (gamma * sigma^2)', () => {
    // mu = 10%, r = 2%, sigma = 20%, gamma = 2 -> (0.10 - 0.02) / (2 * 0.04) = 0.08 / 0.08 = 1.0 (100%)
    const config: MertonPortfolioConfig = {
      initialWealth: 100000,
      riskFreeRatePct: 2.0,
      expectedReturnPct: 10.0,
      volatilityPct: 20.0,
      relativeRiskAversion: 2.0,
      discountRatePct: 3.0,
      timeHorizonYears: 5.0,
    };

    const result = engine.optimize(config);

    expect(result.optimalRiskyWeightPct).toBeCloseTo(100.0, 2);
    expect(result.optimalRiskFreeWeightPct).toBeCloseTo(0.0, 2);
    expect(result.mertonRatio).toBeCloseTo(1.0, 2);
  });

  it('halves exposure when risk aversion doubles', () => {
    const baseConfig: MertonPortfolioConfig = {
      initialWealth: 100000,
      riskFreeRatePct: 3.0,
      expectedReturnPct: 11.0,
      volatilityPct: 20.0,
      relativeRiskAversion: 2.0,
      discountRatePct: 4.0,
      timeHorizonYears: 3.0,
    };

    const res1 = engine.optimize(baseConfig);
    const res2 = engine.optimize({ ...baseConfig, relativeRiskAversion: 4.0 });

    expect(res2.optimalRiskyWeightPct).toBeCloseTo(res1.optimalRiskyWeightPct / 2.0, 2);
  });

  it('produces plausible consumption rate and trajectory path', () => {
    const config: MertonPortfolioConfig = {
      initialWealth: 50000,
      riskFreeRatePct: 4.0,
      expectedReturnPct: 12.0,
      volatilityPct: 25.0,
      relativeRiskAversion: 3.0,
      discountRatePct: 5.0,
      timeHorizonYears: 10.0,
      steps: 10,
    };

    const result = engine.optimize(config);

    expect(result.trajectory.length).toBe(11);
    expect(result.initialConsumptionRate).toBeGreaterThan(0);
    expect(result.expectedTerminalWealth).toBeGreaterThan(0);
    expect(result.trajectory[0]!.expectedWealth).toBe(50000);
  });

  it('handles log utility (gamma = 1) seamlessly', () => {
    const config: MertonPortfolioConfig = {
      initialWealth: 10000,
      riskFreeRatePct: 1.0,
      expectedReturnPct: 9.0,
      volatilityPct: 20.0,
      relativeRiskAversion: 1.0, // log utility
      discountRatePct: 2.0,
      timeHorizonYears: 2.0,
    };

    const result = engine.optimize(config);

    // pi = (0.09 - 0.01) / (1.0 * 0.04) = 2.0 (200% leveraged)
    expect(result.optimalRiskyWeightPct).toBeCloseTo(200.0, 2);
    expect(result.optimalRiskFreeWeightPct).toBeCloseTo(-100.0, 2);
  });

  it('validates configuration constraints', () => {
    expect(() => engine.optimize({
      initialWealth: -100,
      riskFreeRatePct: 2,
      expectedReturnPct: 5,
      volatilityPct: 20,
      relativeRiskAversion: 2,
      discountRatePct: 3,
      timeHorizonYears: 1,
    })).toThrow('Initial wealth must be strictly positive');

    expect(() => engine.optimize({
      initialWealth: 100,
      riskFreeRatePct: 2,
      expectedReturnPct: 5,
      volatilityPct: 0,
      relativeRiskAversion: 2,
      discountRatePct: 3,
      timeHorizonYears: 1,
    })).toThrow('Volatility must be strictly positive');
  });
});
