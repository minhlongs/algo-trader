import { describe, expect, it } from 'vitest';
import {
  acklamNormalQuantile,
  computeMultiAssetVarCvar,
  computePortfolioParametricSigma,
  computeVarCvar,
  CrossEngineVarCvarCalculator,
  normalPdf,
} from '../cross-engine-var-cvar';
import type { PositionRisk } from '../portfolio-risk-types';

describe('CrossEngineVarCvar & Acklam Approximation', () => {
  const returns = [-0.02, -0.015, -0.01, 0.005, 0.01, 0.015, 0.02, -0.03, 0.012, 0.008];
  const nav = 100000;

  it('Acklam rational approximation calculates normal quantiles accurately', () => {
    const z95 = acklamNormalQuantile(0.95);
    const z99 = acklamNormalQuantile(0.99);
    expect(z95).toBeCloseTo(1.64485, 3);
    expect(z99).toBeCloseTo(2.32635, 3);
    expect(() => acklamNormalQuantile(0)).toThrow();
    expect(() => acklamNormalQuantile(1)).toThrow();
  });

  it('computes normal standard probability density function', () => {
    expect(normalPdf(0)).toBeCloseTo(0.39894, 4);
    expect(normalPdf(1.96)).toBeCloseTo(0.05844, 4);
  });

  it('computes parametric and historical VaR / CVaR', () => {
    const v95 = computeVarCvar(returns, nav, 0.95, 1);
    const v99 = computeVarCvar(returns, nav, 0.99, 1);

    expect(v95.parametricVaR).toBeGreaterThan(0);
    expect(v99.parametricVaR).toBeGreaterThan(v95.parametricVaR);
    expect(v95.historicalVaR).toBeGreaterThan(0);
    expect(v95.historicalCVaR).toBeGreaterThanOrEqual(v95.historicalVaR);
    expect(v95.parametricCVaR).toBeGreaterThanOrEqual(v95.parametricVaR);
  });

  it('scales VaR and CVaR with square root of time horizon', () => {
    const v1 = computeVarCvar(returns, nav, 0.95, 1);
    const v16 = computeVarCvar(returns, nav, 0.95, 16);
    expect(v16.parametricVaR).toBeCloseTo(v1.parametricVaR * 4, 0);
  });

  it('handles small sample observation (< 5) with fallback bounds', () => {
    const res = computeVarCvar([0.01, -0.01], nav, 0.95, 1);
    expect(res.parametricVaR).toBeGreaterThan(0);
    expect(res.historicalVaR).toBeGreaterThan(0);
    expect(res.portfolioNav).toBe(nav);
  });

  it('handles flat returns with zero variance without producing NaN', () => {
    const res = computeVarCvar([0, 0, 0, 0, 0, 0], nav, 0.95, 1);
    expect(Number.isFinite(res.parametricVaR)).toBe(true);
    expect(Number.isFinite(res.historicalVaR)).toBe(true);
  });

  it('computes multi-asset portfolio parametric sigma via covariance matrix', () => {
    const weights = [0.25, 0.25, 0.25, 0.25];
    const cov = [
      [0.04, 0.01, 0.01, 0.01],
      [0.01, 0.04, 0.01, 0.01],
      [0.01, 0.01, 0.04, 0.01],
      [0.01, 0.01, 0.01, 0.04],
    ];
    const sigma = computePortfolioParametricSigma(weights, cov);
    expect(sigma).toBeGreaterThan(0);
    expect(sigma).toBeLessThan(0.2); // Less than single asset std dev due to diversification
  });

  it('computes multi-asset VaR and CVaR with asset returns matrix', () => {
    const weights = [0.5, 0.5];
    const cov = [
      [0.01, 0.002],
      [0.002, 0.01],
    ];
    const assetReturns = [
      [-0.02, 0.01, 0.03, -0.01, 0.02, -0.04],
      [-0.01, 0.02, 0.01, -0.02, 0.01, -0.03],
    ];
    const res = computeMultiAssetVarCvar(weights, cov, nav, 0.95, 1, assetReturns);
    expect(res.parametricVaR).toBeGreaterThan(0);
    expect(res.historicalVaR).toBeGreaterThan(0);
    expect(res.historicalCVaR).toBeGreaterThanOrEqual(res.historicalVaR);
  });

  it('CrossEngineVarCvarCalculator processes position risk objects', () => {
    const calculator = new CrossEngineVarCvarCalculator();
    const positions: PositionRisk[] = [
      {
        symbol: 'BTC',
        engineId: 'arbitrage',
        venue: 'binance',
        notionalUsd: 50000,
        currentPrice: 60000,
        quantity: 0.83,
        side: 'BUY',
        delta: 1.0,
        unrealizedPnlUsd: 100,
        timestamp: Date.now(),
      },
      {
        symbol: 'ETH',
        engineId: 'marl',
        venue: 'bybit',
        notionalUsd: 30000,
        currentPrice: 3000,
        quantity: 10,
        side: 'BUY',
        delta: 1.0,
        unrealizedPnlUsd: -50,
        timestamp: Date.now(),
      },
    ];
    const cov = [
      [0.04, 0.02],
      [0.02, 0.05],
    ];
    const res = calculator.calculateFromPositions(positions, cov, nav, 0.95, 1);
    expect(res.parametricVaR).toBeGreaterThan(0);
    expect(res.portfolioNav).toBe(nav);
  });
});
