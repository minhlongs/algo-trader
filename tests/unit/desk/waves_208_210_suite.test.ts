/**
 * Zero-mock unit test suite for Quantitative Desk Waves 208-210.
 *
 * Tests:
 * - Wave 208: Barndorff-Nielsen, Kinnebrock & Shephard (2010) Realized Semivariance & Signed Jumps
 * - Wave 209: Andersen, Bollerslev, Diebold & Wu (2006) Realized Continuous & Jump Beta
 * - Wave 210: Bekaert, Hoerova & Lo Duca (2013) VIX Uncertainty & Risk Aversion Decomposition
 *
 * Strictly < 180 LOC, zero mocks, zero :any.
 */

import { describe, it, expect } from 'vitest';
import { SemivarianceEngine, SemivarianceMath } from '../../../src/desk/semivariance';
import { RealizedBetaEngine, RealizedBetaMath } from '../../../src/desk/realizedbeta';
import { BekaertEngine, BekaertMath } from '../../../src/desk/bekaert';

describe('Wave 208: Barndorff-Nielsen, Kinnebrock & Shephard (2010) Realized Semivariance', () => {
  it('accurately decomposes positive and negative returns into signed semivariances', () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.03, -0.01];
    const { rv, rsPlus, rsMinus } = SemivarianceMath.calculateSignedSemivariance(returns);

    expect(rv).toBeCloseTo(rsPlus + rsMinus, 8);
    expect(rsPlus).toBeCloseTo(0.01 ** 2 + 0.015 ** 2 + 0.03 ** 2, 8);
    expect(rsMinus).toBeCloseTo((-0.02) ** 2 + (-0.005) ** 2 + (-0.01) ** 2, 8);
  });

  it('evaluates upside vs downside volatility asymmetry and signed jump variations', () => {
    const engine = new SemivarianceEngine();
    // Skewed bearish shock returns
    const bearishReturns: number[] = [];
    for (let i = 0; i < 100; i++) {
      bearishReturns.push(i % 2 === 0 ? 0.002 : -0.008);
    }

    const res = engine.evaluate(bearishReturns);
    expect(res.sampleSize).toBe(100);
    expect(res.negativeSemivariance).toBeGreaterThan(res.positiveSemivariance);
    expect(res.asymmetryRatio).toBeLessThan(0);
    expect(res.volatilityRegime).toBe('BAD_VOLATILITY');
    expect(res.annualizedBadVol).toBeGreaterThan(res.annualizedGoodVol);
    expect(res.bipowerVariation).toBeGreaterThan(0);
  });
});

describe('Wave 209: Andersen, Bollerslev, Diebold & Wu (2006) Realized Beta', () => {
  it('calculates realized moments, correlations, and bipower covariances', () => {
    const market = [0.01, -0.015, 0.02, -0.008, 0.012];
    const asset = [0.015, -0.02, 0.025, -0.01, 0.018]; // Co-moving beta > 1

    const { rcov, rvAsset, rvMarket, corr } = RealizedBetaMath.calculateRealizedMoments(asset, market);
    expect(rcov).toBeGreaterThan(0);
    expect(rvAsset).toBeGreaterThan(rvMarket);
    expect(corr).toBeGreaterThan(0.95);

    const bcov = RealizedBetaMath.calculateBipowerCovariance(asset, market);
    expect(bcov).toBeGreaterThan(0);
  });

  it('decomposes total realized beta into continuous and jump systemic sensitivities', () => {
    const engine = new RealizedBetaEngine();
    const market: number[] = [];
    const asset: number[] = [];

    for (let i = 0; i < 120; i++) {
      const rm = 0.003 * Math.sin(i * 0.2);
      market.push(rm);
      asset.push(1.3 * rm + 0.0005 * Math.cos(i));
    }

    const res = engine.evaluate(asset, market);
    expect(res.sampleSize).toBe(120);
    expect(res.totalRealizedBeta).toBeCloseTo(1.3, 1);
    expect(res.continuousBeta).toBeGreaterThan(0.8);
    expect(res.betaRegime).toBe('AGGRESSIVE');
    expect(res.systemicRiskFraction).toBeGreaterThan(0.7);
    expect(res.idiosyncraticVariance).toBeGreaterThanOrEqual(0);
  });
});

describe('Wave 210: Bekaert, Hoerova & Lo Duca (2013) VIX Decomposition', () => {
  it('forecasts conditional physical variance via calibrated econometric lag model', () => {
    const dailyRvs = [0.00012, 0.00015, 0.00018, 0.00014, 0.00016];
    const vixSquaredAnnualized = 0.04; // 20% VIX -> 0.04 variance
    const expRv = BekaertMath.forecastPhysicalVariance(dailyRvs, vixSquaredAnnualized);

    expect(expRv).toBeGreaterThan(0.01);
    expect(expRv).toBeLessThan(0.10);
  });

  it('decomposes VIX into physical economic uncertainty and variance risk premium', () => {
    const engine = new BekaertEngine();
    const dailyRvs: number[] = [];
    for (let i = 0; i < 30; i++) {
      dailyRvs.push(0.00012 + 0.00002 * Math.sin(i));
    }

    // Normal regime VIX = 19.5
    const resNormal = engine.evaluate(19.5, dailyRvs);
    expect(resNormal.vixSquaredAnnualized).toBeCloseTo((0.195) ** 2, 6);
    expect(resNormal.economicUncertainty).toBeGreaterThan(0.10);
    expect(resNormal.varianceRiskPremium).toBeDefined();
    expect(resNormal.uncertaintySharePct + resNormal.vrpSharePct).toBeCloseTo(100.0, 2);

    // Crisis panic regime VIX = 48.0
    const resPanic = engine.evaluate(48.0, dailyRvs);
    expect(resPanic.marketSentiment).toBe('PANIC_SPREAD');
    expect(resPanic.riskAversionIndex).toBeGreaterThan(0);
  });
});
