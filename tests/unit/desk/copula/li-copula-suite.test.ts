import { describe, expect, it } from 'vitest';
import { LiCopulaEngine } from '../../../../src/desk/copula/li-copula-engine';
import { LiCopulaPairParams } from '../../../../src/desk/copula/li-copula-types';
import { LiCopulaMath } from '../../../../src/desk/copula/li-copula-math';

describe('Li (2000) Gaussian Copula Suite (Desk 110)', () => {
  const baseParams: LiCopulaPairParams = {
    asset1: {
      id: 'BOND_A',
      hazardRate: 0.02,     // 2% annual default intensity
      recoveryRate: 0.40,   // 40% recovery
      notional: 1000000,
    },
    asset2: {
      id: 'BOND_B',
      hazardRate: 0.03,     // 3% annual default intensity
      recoveryRate: 0.40,
      notional: 1000000,
    },
    timeHorizon: 5.0,       // 5 years
    assetCorrelation: 0.5,  // 50% equity/asset return correlation
  };

  it('should calculate accurate marginal default probabilities', () => {
    const result = LiCopulaEngine.calculateBivariateDefault(baseParams);

    // F(5) = 1 - exp(-0.02 * 5) = 1 - exp(-0.1) ~ 0.09516
    expect(result.marginalDefaultProb1).toBeCloseTo(1.0 - Math.exp(-0.1), 4);
    // F(5) = 1 - exp(-0.03 * 5) = 1 - exp(-0.15) ~ 0.13929
    expect(result.marginalDefaultProb2).toBeCloseTo(1.0 - Math.exp(-0.15), 4);
  });

  it('should increase joint default probability as asset correlation increases', () => {
    const uncorrelated = LiCopulaEngine.calculateBivariateDefault({
      ...baseParams,
      assetCorrelation: 0.0,
    });
    const correlated = LiCopulaEngine.calculateBivariateDefault({
      ...baseParams,
      assetCorrelation: 0.7,
    });

    // Uncorrelated joint default prob should equal product of marginals P1 * P2
    expect(uncorrelated.jointDefaultProbability).toBeCloseTo(
      uncorrelated.marginalDefaultProb1 * uncorrelated.marginalDefaultProb2,
      3
    );

    // Positive correlation elevates probability of both defaulting together
    expect(correlated.jointDefaultProbability).toBeGreaterThan(uncorrelated.jointDefaultProbability);
    expect(correlated.defaultCorrelation).toBeGreaterThan(0.0);
  });

  it('should verify inverse normal CDF accuracy', () => {
    expect(LiCopulaMath.inverseNormalCdf(0.5)).toBeCloseTo(0.0, 4);
    expect(LiCopulaMath.inverseNormalCdf(0.8413447)).toBeCloseTo(1.0, 3);
    expect(LiCopulaMath.inverseNormalCdf(0.9772498)).toBeCloseTo(2.0, 3);
  });
});
