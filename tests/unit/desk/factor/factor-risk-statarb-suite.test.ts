import { describe, it, expect } from 'vitest';
import { BarraFactorAttribution } from '../../../../src/desk/factor/barra-factor-attribution';
import { IdiosyncraticRiskDecomposer } from '../../../../src/desk/factor/idiosyncratic-risk-decomposer';
import { MarketNeutralOptimizer } from '../../../../src/desk/factor/market-neutral-optimizer';
import { FactorExposureVector } from '../../../../src/desk/factor/factor-types';

describe('Factor Risk & Statistical Arbitrage Model Suite', () => {
  const btcExposure: FactorExposureVector = {
    asset: 'BTC',
    marketBeta: 1.2,
    sizeFactor: 0.8,
    valueFactor: -0.2,
    momentumFactor: 0.5,
    volatilityFactor: 0.9,
  };

  describe('BarraFactorAttribution', () => {
    it('decomposes total asset return into style factor contributions and residual', () => {
      const attribution = new BarraFactorAttribution();
      const factorReturns = {
        market: 0.02,
        size: 0.005,
        value: 0.001,
        momentum: 0.015,
        volatility: -0.01,
      };

      const res = attribution.attributeReturn(btcExposure, factorReturns, 0.045);
      expect(res.asset).toBe('BTC');
      expect(res.factorContributions.market).toBeCloseTo(0.024, 3);
      expect(res.factorExplainedReturnPct).toBeGreaterThan(0.01);
      expect(res.specificResidualReturnPct).toBeDefined();
    });
  });

  describe('IdiosyncraticRiskDecomposer', () => {
    it('splits total return variance into systematic and specific variance', () => {
      const decomposer = new IdiosyncraticRiskDecomposer();
      const factorCov = {
        market: 0.04,
        size: 0.01,
        value: 0.01,
        momentum: 0.02,
      };

      const res = decomposer.decomposeVariance(btcExposure, factorCov, 0.09);
      expect(res.systematicVariance).toBeGreaterThan(0.04);
      expect(res.specificVariance).toBeGreaterThan(0.001);
      expect(res.rSquared).toBeGreaterThan(0.5);
      expect(res.rSquared).toBeLessThanOrEqual(1.0);
    });
  });

  describe('MarketNeutralOptimizer', () => {
    it('allocates dollar-balanced long and short baskets', () => {
      const optimizer = new MarketNeutralOptimizer();
      const alphas = {
        BTC: 0.05,
        ETH: 0.03,
        SOL: -0.02,
        AVAX: -0.04,
      };

      const exposures = new Map<string, FactorExposureVector>();
      exposures.set('BTC', btcExposure);
      exposures.set('ETH', { ...btcExposure, asset: 'ETH', marketBeta: 1.1 });
      exposures.set('SOL', { ...btcExposure, asset: 'SOL', marketBeta: 1.4 });
      exposures.set('AVAX', { ...btcExposure, asset: 'AVAX', marketBeta: 1.5 });

      const portfolio = optimizer.optimizePortfolio(alphas, exposures, {
        targetGrossExposureUsd: 1_000_000,
        maxNetBetaExposure: 0.05,
        maxSingleNameWeight: 0.35,
      });

      expect(portfolio.length).toBe(4);
      const longs = portfolio.filter((p) => p.side === 'LONG');
      const shorts = portfolio.filter((p) => p.side === 'SHORT');
      expect(longs.length).toBe(2);
      expect(shorts.length).toBe(2);

      const netWeight = portfolio.reduce((acc, p) => acc + p.weight, 0);
      expect(Math.abs(netWeight)).toBeLessThan(0.001);
    });
  });
});
