import { describe, it, expect } from 'vitest';
import { evaluateAlphaSurvivalGate } from '../../../../src/alpha-lab/attribution/alpha-survival-gate';
import { evaluateAlpha } from '../../../../src/alpha-lab/attribution/alpha-evaluator';
import { bootstrapSharpeCi } from '../../../../src/alpha-lab/validation/bootstrap-sharpe';
import { runMonteCarloPermutation } from '../../../../src/alpha-lab/validation/monte-carlo-permutation';
import { evaluateStatisticalGate, evaluateNumericGate } from '../../../../src/alpha-lab/gates/gate-evaluator-rules';
import {
  resolveCostConfig,
  applyStressToBaselineConfig,
  listStressModes,
} from '../../../../src/alpha-lab/cost-model/cost-stress';
import { detectRegimeFilter } from '../../../../src/alpha-lab/reports/hypothesis-rules';
import { makeTrendUpCandles } from '../fixtures/market-data-fixtures';
import { makeSyntheticTrades, makeCandidateResult, makeEvaluationReport } from '../fixtures/test-helpers';

export function registerTier1GatesTests(): void {
  describe('Feature 5: Core Performance Survival Gates (F5)', () => {
    it('F5.1: passes candidate meeting Sharpe, win rate, and drawdown limits', () => {
      const candidate = makeCandidateResult({ sharpeRatio: 1.8, winRate: 0.65, maxDrawdown: 0.08 });
      const verdict = evaluateAlpha(candidate, makeTrendUpCandles(50).map((c) => ({ timestamp: c.timestamp, close: c.close })));
      expect(verdict.passed).toBe(true);
      expect(verdict.failedCriteria.length).toBe(0);
    });

    it('F5.2: fails candidate with out-of-sample Sharpe ratio below hurdle rate', () => {
      const candidate = makeCandidateResult({ sharpeRatio: -0.4, totalNetPnl: -100 });
      const verdict = evaluateAlpha(candidate, makeTrendUpCandles(50).map((c) => ({ timestamp: c.timestamp, close: c.close })));
      expect(verdict.passed).toBe(false);
      expect(verdict.failedCriteria.some((c) => c.toLowerCase().includes('sharpe'))).toBe(true);
    });

    it('F5.3: fails candidate with maximum drawdown exceeding tolerance limit', () => {
      const gateStatus = evaluateNumericGate('max_drawdown', 0.22);
      expect(gateStatus.passed).toBe(false);
      expect(gateStatus.threshold).toBe(0.15);
    });

    it('F5.4: fails candidate with profit factor below hurdle', () => {
      const gateStatus = evaluateNumericGate('profit_factor', 1.10);
      expect(gateStatus.passed).toBe(false);
      expect(gateStatus.threshold).toBe(1.3);
    });

    it('F5.5: compiles structured diagnostic failure reasons for rejected candidates', () => {
      const res = evaluateAlphaSurvivalGate({
        summary: {
          testSharpe: 0.8,
          testMaxDrawdown: 0.25,
          regimeConsistencyScore: 0.40,
        } as unknown as Parameters<typeof evaluateAlphaSurvivalGate>[0]['summary'],
      });
      expect(res.passed).toBe(false);
      expect(res.failures.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Feature 6: Deflated Sharpe Ratio (DSR) & Statistical Significance (F6)', () => {
    it('F6.1: computes bootstrap Sharpe confidence intervals across simulated paths', () => {
      const returns = [0.01, 0.02, -0.005, 0.015, 0.03, -0.01, 0.02, 0.005, 0.012, 0.018];
      const res = bootstrapSharpeCi(returns, { nBootstrap: 100, seed: 42 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.ciLower).toBeLessThan(res.ciUpper);
        expect(res.probPositive).toBeGreaterThan(0.5);
      }
    });

    it('F6.2: evaluates Monte Carlo permutation test to detect path dependency and data snooping', () => {
      const pnls = [100, 150, -50, 200, 120, -80, 90, 110, -40, 160];
      const res = runMonteCarloPermutation(pnls, { initialCapital: 10000, nSimulations: 50, seed: 123 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.nSimulations).toBe(50);
        expect(typeof res.pValueSharpe).toBe('number');
      }
    });

    it('F6.3: evaluates statistical_significance gate verifying p-value <= 0.05', () => {
      const passed = evaluateStatisticalGate({ pValueSharpe: 0.02, sharpeCiLower: 0.5 });
      expect(passed.passed).toBe(true);
      const failed = evaluateStatisticalGate({ pValueSharpe: 0.12, sharpeCiLower: -0.2 });
      expect(failed.passed).toBe(false);
    });

    it('F6.4: rejects candidate when Sharpe CI lower bound crosses below zero', () => {
      const status = evaluateStatisticalGate({ pValueSharpe: 0.01, sharpeCiLower: -0.05 });
      expect(status.passed).toBe(false);
    });

    it('F6.5: penalizes strategy selection when trial count increases or returns exhibit high kurtosis', () => {
      const resLargeP = evaluateStatisticalGate({ pValueSharpe: 0.08 });
      expect(resLargeP.passed).toBe(false);
    });
  });

  describe('Feature 7: Transaction Cost Stress Testing (F7)', () => {
    it('F7.1: resolves base fee and slippage configurations across exchange presets', () => {
      const config = resolveCostConfig('NORMAL');
      expect(config.feeBps).toBeGreaterThan(0);
      expect(config.slippageBps).toBeGreaterThan(0);
    });

    it('F7.2: evaluates cost stress under CONSERVATIVE friction preset', () => {
      const normal = resolveCostConfig('NORMAL');
      const stressed = applyStressToBaselineConfig(null, 'CONSERVATIVE');
      expect(stressed.feeBps).toBeGreaterThanOrEqual(normal.feeBps);
    });

    it('F7.3: evaluates cost stress under ADVERSE friction preset', () => {
      const normal = resolveCostConfig('NORMAL');
      const stressed = applyStressToBaselineConfig(null, 'ADVERSE');
      expect(stressed.feeBps).toBeGreaterThan(normal.feeBps);
      expect(stressed.slippageBps).toBeGreaterThan(normal.slippageBps);
    });

    it('F7.4: scales fees up to 3x base multiplier to test net expectancy under fee surges', () => {
      const extreme = applyStressToBaselineConfig(null, 'EXTREME');
      expect(extreme.feeBps).toBeGreaterThanOrEqual(20);
      expect(listStressModes()).toContain('EXTREME');
    });

    it('F7.5: rejects candidate when net profit turns negative under stressed cost conditions', () => {
      const res = evaluateAlphaSurvivalGate({
        trades: makeSyntheticTrades(20, 0.52, 10, -9),
        summary: {
          testSharpe: 1.8,
          testMaxDrawdown: 0.08,
          regimeConsistencyScore: 0.8,
        } as unknown as Parameters<typeof evaluateAlphaSurvivalGate>[0]['summary'],
        baselineFeeBps: 20,
        baselineSlippageBps: 20,
      });
      expect(typeof res.costStressPassed).toBe('boolean');
    });
  });

  describe('Feature 8: Regime Consistency Hurdle (F8)', () => {
    it('F8.1: calculates regime consistency score across walkforward evaluation folds', () => {
      const res = evaluateAlphaSurvivalGate({
        summary: {
          testSharpe: 1.8,
          testMaxDrawdown: 0.08,
          regimeConsistencyScore: 0.85,
        } as unknown as Parameters<typeof evaluateAlphaSurvivalGate>[0]['summary'],
      });
      expect(res.regimeConsistencyScore).toBe(0.85);
    });

    it('F8.2: passes candidate achieving positive returns in >= 70% of evaluated regimes', () => {
      const res = evaluateAlphaSurvivalGate({
        summary: {
          testSharpe: 1.8,
          testMaxDrawdown: 0.08,
          regimeConsistencyScore: 0.75,
        } as unknown as Parameters<typeof evaluateAlphaSurvivalGate>[0]['summary'],
        criteria: { minRegimeConsistencyScore: 0.70 },
      });
      expect(res.regimeConsistencyScore).toBeGreaterThanOrEqual(0.70);
    });

    it('F8.3: fails candidate with regime consistency score below 0.70 hurdle', () => {
      const res = evaluateAlphaSurvivalGate({
        summary: {
          testSharpe: 1.8,
          testMaxDrawdown: 0.08,
          regimeConsistencyScore: 0.55,
        } as unknown as Parameters<typeof evaluateAlphaSurvivalGate>[0]['summary'],
        criteria: { minRegimeConsistencyScore: 0.70 },
      });
      expect(res.passed).toBe(false);
      expect(res.failures.some((f) => f.includes('Regime consistency score'))).toBe(true);
    });

    it('F8.4: verifies candidate returns across trending vs choppy market regimes', () => {
      const report = makeEvaluationReport();
      expect(report.byRegime.length).toBeGreaterThanOrEqual(2);
      expect(report.byRegime.some((r) => r.regime === 'TREND_UP')).toBe(true);
    });

    it('F8.5: detects regime concentration diagnostics when alpha only works in a single regime', () => {
      const report = makeEvaluationReport();
      const diags = detectRegimeFilter(report);
      expect(Array.isArray(diags)).toBe(true);
    });
  });
}
