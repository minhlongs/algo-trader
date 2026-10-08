import { describe, it, expect } from 'vitest';
import { FactorRiskParityOptimizer } from '../../../../src/desk/riskparity/factor-risk-parity-optimizer';
import { FactorCovarianceMatrix } from '../../../../src/desk/riskparity/riskparity-types';

describe('Barra Multi-Factor Risk Parity Desk Suite', () => {
  it('solves equal risk contribution weights for multi-factor covariance matrix', () => {
    const optimizer = new FactorRiskParityOptimizer();

    // 3 systematic factors with different volatilities:
    // Factor 1 (Low Vol): sigma = 10%
    // Factor 2 (Medium Vol): sigma = 20%
    // Factor 3 (High Vol): sigma = 30%
    // Independent for simplicity
    const covMatrix: FactorCovarianceMatrix = {
      factors: ['LOW_VOL', 'MOMENTUM', 'VALUE'],
      matrix: [
        [0.010, 0.000, 0.000],
        [0.000, 0.040, 0.000],
        [0.000, 0.000, 0.090],
      ],
    };

    const res = optimizer.computeRiskParity(covMatrix);

    expect(res.weights.length).toBe(3);
    // Lower vol factor must receive higher capital weight to equalize risk
    expect(res.weights[0]!.weight).toBeGreaterThan(res.weights[1]!.weight);
    expect(res.weights[1]!.weight).toBeGreaterThan(res.weights[2]!.weight);

    // Each factor should contribute ~33.33% of total risk
    for (const p of res.percentRiskContributions) {
      expect(p.riskPct).toBeCloseTo(33.33, 0);
    }

    expect(res.isParityAchieved).toBe(true);
  });
});
