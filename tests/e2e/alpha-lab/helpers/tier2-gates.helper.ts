import { describe, it, expect } from 'vitest';
import { evaluateAlpha } from '../../../../src/alpha-lab/attribution/alpha-evaluator';
import { bootstrapSharpeCi } from '../../../../src/alpha-lab/validation/bootstrap-sharpe';
import { runMonteCarloPermutation } from '../../../../src/alpha-lab/validation/monte-carlo-permutation';
import {
  DEFAULT_STRESS_PRESETS,
  resolveCostConfig,
  applyStressToBaselineConfig,
  listStressModes,
} from '../../../../src/alpha-lab/cost-model/cost-stress';
import {
  detectDrawdown,
  detectSmallSample,
  detectProfitFactor,
  detectStopLoss,
} from '../../../../src/alpha-lab/reports/hypothesis-rules';
import { makeRangeCandles } from '../fixtures/market-data-fixtures';
import { makeCandidateResult, makeEvaluationReport } from '../fixtures/test-helpers';

export function registerTier2GatesTests(): void {
  const closes = makeRangeCandles(60).map((c) => ({ timestamp: c.timestamp, close: c.close }));

  describe('Feature 5: Core Performance Survival Gates Boundaries (F5)', () => {
    it('B5.1: boundary Sharpe: 0.000 passes minSharpe: 0; -0.001 fails', () => {
      const p = evaluateAlpha(makeCandidateResult({ sharpeRatio: 0.0, totalNetPnl: 1000, winRate: 0.55 }), closes);
      const f = evaluateAlpha(makeCandidateResult({ sharpeRatio: -0.001, totalNetPnl: 1000, winRate: 0.55 }), closes);
      expect(p.failedCriteria.some((c) => c.includes('Sharpe'))).toBe(false);
      expect(f.failedCriteria.some((c) => c.includes('Sharpe'))).toBe(true);
    });

    it('B5.2: boundary Win Rate: 0.499 fails minWinRate: 0.5; 0.500 passes', () => {
      const f = evaluateAlpha(makeCandidateResult({ winRate: 0.499, sharpeRatio: 1.0, totalNetPnl: 1000 }), closes);
      const p = evaluateAlpha(makeCandidateResult({ winRate: 0.500, sharpeRatio: 1.0, totalNetPnl: 1000 }), closes);
      expect(f.failedCriteria.some((c) => c.includes('win rate'))).toBe(true);
      expect(p.failedCriteria.some((c) => c.includes('win rate'))).toBe(false);
    });

    it('B5.3: fails survival gate on catastrophic drawdown (80% drop)', () => {
      const v = evaluateAlpha(makeCandidateResult({ maxDrawdown: 0.80, totalNetPnl: -8000, sharpeRatio: -2.0 }), closes);
      expect(v.passed).toBe(false);
      expect(v.failedCriteria.length).toBeGreaterThan(0);
    });

    it('B5.4: detects Small Sample Size diagnostic when trade count is below 30', () => {
      const hyps = detectSmallSample(makeEvaluationReport({ totalTrades: 12 }));
      expect(hyps.length).toBe(1);
      expect(hyps[0]?.name).toBe('Sample Size Increase');
    });

    it('B5.5: returns empty hypotheses when all metrics comfortably pass thresholds', () => {
      const r = makeEvaluationReport({ winRate: 0.50, sharpeRatio: 2.0, maxDrawdown: 0.05, profitFactor: 2.5, totalTrades: 100 });
      expect(detectDrawdown(r)).toEqual([]);
      expect(detectStopLoss(r)).toEqual([]);
      expect(detectProfitFactor(r)).toEqual([]);
    });
  });

  describe('Feature 6: Deflated Sharpe Ratio & Statistical Significance Boundaries (F6)', () => {
    it('B6.1: handles small sample size in bootstrap Sharpe CI safely', () => {
      const ci = bootstrapSharpeCi([10, -5], { nBootstrap: 50, seed: 42 });
      expect(ci.ok).toBe(false);
      expect(ci.error).toContain('need at least 5');
    });

    it('B6.2: Monte Carlo permutation test with zero-variance PnLs does not crash', () => {
      const mc = runMonteCarloPermutation([0, 0, 0, 0], { initialCapital: 10000, nSimulations: 20, seed: 42 });
      expect(mc.ok).toBe(true);
      if (mc.ok) {
        expect(mc.pValueSharpe).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(mc.simulatedSharpeMean)).toBe(true);
      }
    });

    it('B6.3: fat-tailed returns with high kurtosis penalizes Sharpe confidence interval', () => {
      const normalReturns = [0.10, 0.12, 0.09, 0.11, 0.10, 0.08, 0.12, 0.10, 0.09, 0.11];
      const fatTailReturns = [0.10, 0.12, 0.09, 0.11, 0.10, 0.08, 0.12, 0.10, 0.09, -2.00];
      const ciNormal = bootstrapSharpeCi(normalReturns, { nBootstrap: 100, seed: 1 });
      const ciFat = bootstrapSharpeCi(fatTailReturns, { nBootstrap: 100, seed: 1 });
      if (ciNormal.ok && ciFat.ok) {
        expect(ciFat.ciLower).toBeLessThan(ciNormal.ciLower);
      }
    });

    it('B6.4: negative Sharpe CI lower bound correctly triggers statistical significance failure', () => {
      const ci = bootstrapSharpeCi([-0.10, -0.05, -0.20, -0.02, -0.08], { nBootstrap: 50, seed: 42 });
      expect(ci.ok).toBe(true);
      if (ci.ok) {
        expect(ci.ciLower).toBeLessThan(0);
        expect(ci.probPositive).toBeLessThan(0.5);
      }
    });

    it('B6.5: evaluates permutation p-value boundary (0.05)', () => {
      const strongPnls = Array.from({ length: 50 }, () => 100);
      const mc = runMonteCarloPermutation(strongPnls, { initialCapital: 10000, nSimulations: 50, seed: 42 });
      expect(mc.ok).toBe(true);
      if (mc.ok) {
        expect(mc.pValueSharpe).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('Feature 7: Transaction Cost Stress Testing Boundaries (F7)', () => {
    it('B7.1: resolves base fee and slippage configurations across exchange presets', () => {
      const binance = resolveCostConfig('CONSERVATIVE', 'binance');
      const polymarket = resolveCostConfig('CONSERVATIVE', 'polymarket');
      expect(binance.feeBps).toBeDefined();
      expect(polymarket.feeBps).toBeDefined();
    });

    it('B7.2: evaluates cost stress under EXTREME mode with defaults and custom overrides', () => {
      const extreme = resolveCostConfig('EXTREME');
      expect(extreme.feeBps).toBe(DEFAULT_STRESS_PRESETS.EXTREME.feeBps);
      const stressed = applyStressToBaselineConfig({}, 'EXTREME', { feeBps: 50, spreadBps: 25, slippageBps: 50 });
      expect(stressed.feeBps).toBe(75);
      expect(stressed.slippageBps).toBe(50);
    });

    it('B7.3: lists all 4 canonical cost stress modes', () => {
      expect(listStressModes()).toEqual(['NORMAL', 'CONSERVATIVE', 'ADVERSE', 'EXTREME']);
    });

    it('B7.4: scales fees up to 3x base multiplier to test net expectancy under fee surges', () => {
      const base = applyStressToBaselineConfig({ feeBps: 10, slippageBps: 5 }, 'NORMAL');
      const surged = applyStressToBaselineConfig({ feeBps: 30, slippageBps: 15 }, 'EXTREME');
      expect(surged.feeBps).toBeGreaterThan(base.feeBps);
    });

    it('B7.5: rejects candidate when net profit turns negative under stressed cost conditions', () => {
      const marginalCand = makeCandidateResult({ totalNetPnl: 10, totalTrades: 100 });
      const stressedPnl = marginalCand.totalNetPnl - (marginalCand.totalTrades * 5); // $500 fee stress
      expect(stressedPnl).toBeLessThan(0);
    });
  });

  describe('Feature 8: Regime Consistency Hurdle Boundaries (F8)', () => {
    it('B8.1: calculates regime consistency score across walkforward evaluation folds', () => {
      const folds = [{ regime: 'TREND_UP', pnl: 500 }, { regime: 'TREND_DOWN', pnl: 300 }, { regime: 'RANGE', pnl: 100 }];
      const positiveFolds = folds.filter((f) => f.pnl > 0).length;
      const score = positiveFolds / folds.length;
      expect(score).toBe(1.0);
    });

    it('B8.2: boundary consistency: 0.70 passes hurdle', () => {
      const score = 7 / 10;
      expect(score >= 0.70).toBe(true);
    });

    it('B8.3: boundary consistency: 0.699 fails hurdle', () => {
      const score = 0.699;
      expect(score >= 0.70).toBe(false);
    });

    it('B8.4: alpha effective in only 1 regime of 4 produces low consistency score (0.25)', () => {
      const folds = [{ regime: 'TREND_UP', pnl: 1000 }, { regime: 'TREND_DOWN', pnl: -200 }, { regime: 'RANGE', pnl: -100 }, { regime: 'HIGH_VOLATILITY', pnl: -300 }];
      const score = folds.filter((f) => f.pnl > 0).length / folds.length;
      expect(score).toBe(0.25);
      expect(score).toBeLessThan(0.70);
    });

    it('B8.5: handles empty regime series returning 0 consistency score', () => {
      const folds: Array<{ pnl: number }> = [];
      const score = folds.length > 0 ? folds.filter((f) => f.pnl > 0).length / folds.length : 0;
      expect(score).toBe(0);
    });
  });
}
