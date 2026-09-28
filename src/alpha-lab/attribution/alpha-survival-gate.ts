/**
 * Alpha Survival Gate — Quantitative Statistical Survival Gates & Overfitting Filters
 *
 * Enforces institutional quantitative survival criteria on walkforward out-of-sample results:
 * 1. Out-of-sample annualized Sharpe ratio >= 1.5 (hurdle rate)
 * 2. Maximum Drawdown <= 12% (Math.abs(maxDrawdown) <= 0.12)
 * 3. Profit Factor >= 1.25
 * 4. Deflated Sharpe Ratio (DSR) >= 0.95 (Bailey & López de Prado multiple testing correction)
 * 5. Cost-stress testing under 3x baseline friction (positive net expectancy)
 * 6. Multi-regime consistency hurdle >= 70%
 */

import {
  type AlphaSurvivalGateCriteria,
  type AlphaSurvivalGateEvaluation,
  type EvaluateAlphaSurvivalGateInput,
  DEFAULT_ALPHA_SURVIVAL_CRITERIA,
} from './alpha-survival-gate-types';
import { computeCostStressMetrics } from './alpha-survival-gate-stress';
import { computeSkewness, computeKurtosis, expectedMaxSharpe, deflatedSharpeRatio } from '../validation/stats-math';
import { computeProfitFactor } from '../../desk/backtesting/metrics-calculator';

export {
  type AlphaSurvivalGateCriteria,
  type AlphaSurvivalGateEvaluation,
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
 * Evaluate a candidate strategy against institutional statistical survival gates.
 */
export function evaluateAlphaSurvivalGate(input: EvaluateAlphaSurvivalGateInput): AlphaSurvivalGateEvaluation {
  const criteria: AlphaSurvivalGateCriteria = { ...DEFAULT_ALPHA_SURVIVAL_CRITERIA, ...input.criteria };
  const summary = input.summary;
  const trades = input.trades ?? [];
  const evaluatedAt = new Date().toISOString();

  // 1. Performance Gate 1: Sharpe Ratio Hurdle (>= 1.5 default)
  const oosSharpe = summary.testSharpe;
  const sharpePassed = oosSharpe >= criteria.minOosSharpeRatio;

  // 2. Performance Gate 2: Max Drawdown Ceiling (<= 12% default)
  const observedMaxDrawdown = Math.abs(summary.testMaxDrawdown);
  const drawdownPassed = observedMaxDrawdown <= criteria.maxDrawdown;

  // 3. Performance Gate 3: Profit Factor Hurdle (>= 1.25 default)
  let profitFactor = summary.testProfitFactor ?? 0;
  if ((profitFactor === 0 || Number.isNaN(profitFactor)) && trades.length > 0) {
    profitFactor = computeProfitFactor(trades);
  }
  const profitFactorPassed = profitFactor >= criteria.minProfitFactor;

  // 4. DSR & P-Hacking Filter (DSR >= 0.95 default)
  const returns = input.periodicReturns?.length ? [...input.periodicReturns]
    : trades.length ? trades.map((t) => t.pnl ?? 0)
    : (summary.cumulativeEquity ?? []).slice(1).map((pt, i) => {
        const prev = summary.cumulativeEquity![i]!.equity;
        return prev !== 0 ? (pt.equity - prev) / Math.abs(prev) : 0;
      });

  const skewness = computeSkewness(returns);
  const kurtosis = computeKurtosis(returns);
  const trials = input.nTrials ?? criteria.nTrials ?? 1;
  const nObs = returns.length > 1 ? returns.length : Math.max(2, summary.totalTestTrades || 2);
  const srVar = input.trialsVariance ?? criteria.trialsVariance ?? (1 / Math.max(1, nObs - 1));
  const expectedMaxSr = expectedMaxSharpe(trials, srVar);
  const dsr = deflatedSharpeRatio(oosSharpe, srVar, trials, skewness, kurtosis, nObs);
  const dsrPassed = dsr >= criteria.minDsr;

  // 5. Cost-Stress Testing (up to 3x base friction)
  const baseFeeBps = input.baselineFeeBps ?? 5;
  const baseSlippageBps = input.baselineSlippageBps ?? 2;
  const baseFrictionBps = criteria.baseFrictionBps ?? (2 * (baseFeeBps + baseSlippageBps));
  const multiplier = criteria.costStressMultiplier ?? 3.0;
  const stressedFrictionBps = multiplier * baseFrictionBps;
  const baselineRoundTrip = baseFrictionBps / 10000;
  const stressedRoundTrip = stressedFrictionBps / 10000;

  const tradeCount = trades.length > 0 ? trades.length : summary.totalTestTrades;
  const grossPnl = trades.length > 0
    ? trades.reduce((sum, t) => sum + (t.pnl ?? 0) + baselineRoundTrip, 0)
    : summary.testTotalPnl + summary.totalTestTrades * baselineRoundTrip;
  const stressedPnl3x = tradeCount > 0
    ? Math.round((grossPnl - tradeCount * stressedRoundTrip) * 10000) / 10000
    : (summary.testTotalPnl ?? 0);
  const costStressPassed = stressedPnl3x > 0;

  const stress = computeCostStressMetrics(trades, summary, criteria, baseFeeBps, baseSlippageBps);

  // 6. Regime Consistency Hurdle (>= 70% default)
  const regimeConsistencyScore = summary.regimeConsistencyScore;
  const regimeConsistencyPassed = regimeConsistencyScore >= criteria.minRegimeConsistencyScore;

  // Compile detailed failure diagnostics
  const diagnostics: string[] = [];
  if (!sharpePassed) diagnostics.push(`OOS Sharpe ratio of ${oosSharpe.toFixed(2)} is below hurdle rate ${criteria.minOosSharpeRatio.toFixed(2)}`);
  if (!drawdownPassed) diagnostics.push(`Out-of-sample max drawdown of ${(observedMaxDrawdown * 100).toFixed(1)}% exceeds allowable ceiling of ${(criteria.maxDrawdown * 100).toFixed(1)}%`);
  if (!profitFactorPassed) diagnostics.push(`OOS Profit Factor of ${profitFactor.toFixed(2)} is below minimum hurdle ${criteria.minProfitFactor.toFixed(2)}`);
  if (!dsrPassed) diagnostics.push(`Deflated Sharpe Ratio (DSR) of ${dsr.toFixed(4)} is below significance hurdle ${criteria.minDsr.toFixed(2)} (expected max Sharpe = ${expectedMaxSr.toFixed(2)} across ${trials} trials)`);
  if (!costStressPassed) diagnostics.push(`Net PnL collapses to ${stressedPnl3x.toFixed(4)} under ${multiplier}x cost stress (${stressedFrictionBps} bps friction). Strategy has negative net expectancy under market friction.`);
  if (!regimeConsistencyPassed) diagnostics.push(`Regime consistency score of ${regimeConsistencyScore.toFixed(2)} is below minimum ${criteria.minRegimeConsistencyScore.toFixed(2)}`);
  if (!stress.costStressConservativePassed && !diagnostics.some((d) => d.includes('CONSERVATIVE'))) {
    diagnostics.push(`Net PnL collapses to ${stress.conservativeStressPnl.toFixed(4)} under CONSERVATIVE cost stress (${criteria.conservativeFrictionBps ?? 20} bps friction). Strategy is a fee trap.`);
  }
  if (!stress.costStressAdversePassed && !diagnostics.some((d) => d.includes('ADVERSE'))) {
    diagnostics.push(`Net PnL collapses to ${stress.adverseStressPnl.toFixed(4)} under ADVERSE cost stress (${criteria.adverseFrictionBps ?? 50} bps friction). Insufficient margin for adverse execution conditions.`);
  }

  const passed = sharpePassed && drawdownPassed && profitFactorPassed && dsrPassed &&
    costStressPassed && regimeConsistencyPassed && stress.costStressConservativePassed && stress.costStressAdversePassed;

  return {
    passed,
    evaluatedAt,
    sharpeRatio: oosSharpe,
    maxDrawdown: observedMaxDrawdown,
    profitFactor,
    dsr,
    regimeConsistencyScore,
    regimeConsistencyPassed,
    costStressPassed,
    conservativePnl: stress.conservativeStressPnl,
    adversePnl: stress.adverseStressPnl,
    metrics: {
      oosSharpeRatio: oosSharpe,
      maxDrawdown: observedMaxDrawdown,
      profitFactor,
      dsr,
      expectedMaxSharpe: expectedMaxSr,
      skewness,
      kurtosis,
      regimeConsistencyScore,
      splitConsistencyScore: summary.consistencyScore,
      conservativeStressPnl: stress.conservativeStressPnl,
      adverseStressPnl: stress.adverseStressPnl,
      conservativeStressSharpe: stress.conservativeStressSharpe,
      adverseStressSharpe: stress.adverseStressSharpe,
      stressedPnl3x,
      testWinRate: summary.testWinRate,
      testProfitFactor: summary.testProfitFactor,
      totalTestTrades: summary.totalTestTrades,
    },
    checks: {
      sharpePassed,
      drawdownPassed,
      profitFactorPassed,
      dsrPassed,
      regimeConsistencyPassed,
      costStressPassed,
      costStressConservativePassed: stress.costStressConservativePassed,
      costStressAdversePassed: stress.costStressAdversePassed,
    },
    gateChecks: {
      sharpePassed,
      drawdownPassed,
      profitFactorPassed,
      dsrPassed,
      regimeConsistencyPassed,
      costStressPassed,
    },
    thresholds: criteria,
    diagnostics,
    failures: diagnostics,
    rejectionReasons: diagnostics,
  };
}
