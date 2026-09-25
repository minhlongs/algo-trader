/**
 * Alpha Survival Gate — Quantitative Statistical Survival Gates
 *
 * Enforces quantitative survival criteria on walkforward out-of-sample results:
 * 1. Out-of-sample annualized Sharpe ratio >= 1.0 (hurdle rate)
 * 2. Maximum Drawdown <= 15% (Math.abs(maxDrawdown) <= 0.15)
 * 3. Multi-regime consistency score >= 0.50
 * 4. Transaction cost stress resilience under CONSERVATIVE (20 bps) and ADVERSE (50 bps) friction
 */

import {
  type AlphaSurvivalGateCriteria,
  type AlphaSurvivalGateResult,
  type EvaluateAlphaSurvivalGateInput,
  DEFAULT_ALPHA_SURVIVAL_CRITERIA,
} from './alpha-survival-gate-types';
import {
  computeCostStressMetrics,
  compileSurvivalFailures,
} from './alpha-survival-gate-stress';

export {
  type AlphaSurvivalGateCriteria,
  type AlphaSurvivalGateResult,
  type EvaluateAlphaSurvivalGateInput,
  DEFAULT_ALPHA_SURVIVAL_CRITERIA,
} from './alpha-survival-gate-types';

export {
  type CostStressCalculationResult,
  computeCostStressMetrics,
  compileSurvivalFailures,
} from './alpha-survival-gate-stress';

/**
 * Evaluate a candidate strategy against the 4 quantitative survival gates.
 */
export function evaluateAlphaSurvivalGate(input: EvaluateAlphaSurvivalGateInput): AlphaSurvivalGateResult {
  const criteria: AlphaSurvivalGateCriteria = {
    ...DEFAULT_ALPHA_SURVIVAL_CRITERIA,
    ...input.criteria,
  };

  const summary = input.summary;
  const trades = input.trades ?? [];
  const evaluatedAt = new Date().toISOString();

  // 1. Sharpe Ratio Hurdle (>= 1.0)
  const oosSharpe = summary.testSharpe;
  const sharpePassed = oosSharpe >= criteria.minOosSharpeRatio;

  // 2. Max Drawdown Ceiling (<= 15%, sign-normalized via Math.abs)
  const observedMaxDrawdown = Math.abs(summary.testMaxDrawdown);
  const drawdownPassed = observedMaxDrawdown <= criteria.maxDrawdown;

  // 3. Multi-Regime Consistency Score (>= 0.50)
  const regimeConsistencyScore = summary.regimeConsistencyScore;
  const regimeConsistencyPassed = regimeConsistencyScore >= criteria.minRegimeConsistencyScore;

  // 4. Transaction Cost Stress Resilience (20 bps & 50 bps round-trip)
  const baseFeeBps = input.baselineFeeBps ?? 5;
  const baseSlippageBps = input.baselineSlippageBps ?? 2;
  const stress = computeCostStressMetrics(trades, summary, criteria, baseFeeBps, baseSlippageBps);

  const costStressPassed = stress.costStressConservativePassed && stress.costStressAdversePassed;

  // Compile failure reasons
  const checkFlags = {
    sharpePassed,
    drawdownPassed,
    regimeConsistencyPassed,
    costStressConservativePassed: stress.costStressConservativePassed,
    costStressAdversePassed: stress.costStressAdversePassed,
  };

  const metricValues = {
    oosSharpe,
    observedMaxDrawdown,
    regimeConsistencyScore,
    conservativeStressPnl: stress.conservativeStressPnl,
    adverseStressPnl: stress.adverseStressPnl,
  };

  const failures = compileSurvivalFailures(checkFlags, metricValues, criteria);

  const passed =
    sharpePassed &&
    drawdownPassed &&
    regimeConsistencyPassed &&
    stress.costStressConservativePassed &&
    stress.costStressAdversePassed;

  return {
    passed,
    evaluatedAt,
    sharpeRatio: oosSharpe,
    maxDrawdown: observedMaxDrawdown,
    regimeConsistencyScore,
    costStressPassed,
    conservativePnl: stress.conservativeStressPnl,
    adversePnl: stress.adverseStressPnl,
    metrics: {
      oosSharpeRatio: oosSharpe,
      maxDrawdown: observedMaxDrawdown,
      regimeConsistencyScore,
      splitConsistencyScore: summary.consistencyScore,
      conservativeStressPnl: stress.conservativeStressPnl,
      adverseStressPnl: stress.adverseStressPnl,
      conservativeStressSharpe: stress.conservativeStressSharpe,
      adverseStressSharpe: stress.adverseStressSharpe,
      testWinRate: summary.testWinRate,
      testProfitFactor: summary.testProfitFactor,
      totalTestTrades: summary.totalTestTrades,
    },
    checks: checkFlags,
    gateChecks: {
      sharpePassed,
      drawdownPassed,
      regimeConsistencyPassed,
      costStressPassed,
    },
    thresholds: criteria,
    failures,
    rejectionReasons: failures,
  };
}
