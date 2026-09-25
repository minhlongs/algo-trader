/**
 * Alpha Survival Gate Cost Stress & Failure Evaluation Helpers
 */

import type { BacktestTrade } from '../../desk/backtesting/types';
import type { WalkForwardSummary } from '../walkforward/walkforward-types';
import { computeSharpeRatio } from '../../desk/backtesting/metrics-calculator';
import type { AlphaSurvivalGateCriteria } from './alpha-survival-gate-types';

export interface CostStressCalculationResult {
  conservativeStressPnl: number;
  adverseStressPnl: number;
  conservativeStressSharpe: number;
  adverseStressSharpe: number;
  costStressConservativePassed: boolean;
  costStressAdversePassed: boolean;
}

/**
 * Calculates conservative and adverse cost stress PnL and Sharpe.
 */
export function computeCostStressMetrics(
  trades: BacktestTrade[],
  summary: WalkForwardSummary,
  criteria: AlphaSurvivalGateCriteria,
  baseFeeBps: number,
  baseSlippageBps: number,
): CostStressCalculationResult {
  const baselineRoundTrip = 2 * ((baseFeeBps + baseSlippageBps) / 10000);
  const conservativeRoundTrip = criteria.conservativeFrictionBps / 10000;
  const adverseRoundTrip = criteria.adverseFrictionBps / 10000;

  let conservativeStressPnl = 0;
  let adverseStressPnl = 0;
  let conservativeStressSharpe = 0;
  let adverseStressSharpe = 0;
  let costStressConservativePassed = false;
  let costStressAdversePassed = false;

  if (trades.length > 0) {
    const consEquityCurve: Array<{ timestamp: string; equity: number }> = [];
    const advEquityCurve: Array<{ timestamp: string; equity: number }> = [];
    let runningConsEquity = 1;
    let runningAdvEquity = 1;

    for (const trade of trades) {
      const netPnl = trade.pnl ?? 0;
      const grossPnl = netPnl + baselineRoundTrip;
      const consPnl = grossPnl - conservativeRoundTrip;
      const advPnl = grossPnl - adverseRoundTrip;

      conservativeStressPnl += consPnl;
      adverseStressPnl += advPnl;

      runningConsEquity *= 1 + consPnl;
      runningAdvEquity *= 1 + advPnl;

      consEquityCurve.push({ timestamp: trade.timestamp, equity: runningConsEquity });
      advEquityCurve.push({ timestamp: trade.timestamp, equity: runningAdvEquity });
    }

    conservativeStressPnl = Math.round(conservativeStressPnl * 10000) / 10000;
    adverseStressPnl = Math.round(adverseStressPnl * 10000) / 10000;

    conservativeStressSharpe = consEquityCurve.length >= 2 ? computeSharpeRatio(consEquityCurve) : 0;
    adverseStressSharpe = advEquityCurve.length >= 2 ? computeSharpeRatio(advEquityCurve) : 0;

    costStressConservativePassed = conservativeStressPnl > 0;
    costStressAdversePassed = adverseStressPnl > 0;
  } else if (summary.totalTestTrades > 0) {
    const totalTrades = summary.totalTestTrades;
    const grossPnl = summary.testTotalPnl + totalTrades * baselineRoundTrip;
    conservativeStressPnl = Math.round((grossPnl - totalTrades * conservativeRoundTrip) * 10000) / 10000;
    adverseStressPnl = Math.round((grossPnl - totalTrades * adverseRoundTrip) * 10000) / 10000;

    costStressConservativePassed = conservativeStressPnl > 0;
    costStressAdversePassed = adverseStressPnl > 0;
  }

  return {
    conservativeStressPnl,
    adverseStressPnl,
    conservativeStressSharpe,
    adverseStressSharpe,
    costStressConservativePassed,
    costStressAdversePassed,
  };
}

/**
 * Compiles human-readable failure reasons when gate checks fail.
 */
export function compileSurvivalFailures(
  flags: {
    sharpePassed: boolean;
    drawdownPassed: boolean;
    regimeConsistencyPassed: boolean;
    costStressConservativePassed: boolean;
    costStressAdversePassed: boolean;
  },
  metrics: {
    oosSharpe: number;
    observedMaxDrawdown: number;
    regimeConsistencyScore: number;
    conservativeStressPnl: number;
    adverseStressPnl: number;
  },
  criteria: AlphaSurvivalGateCriteria,
): string[] {
  const failures: string[] = [];
  if (!flags.sharpePassed) {
    failures.push(
      `OOS Sharpe ratio of ${metrics.oosSharpe.toFixed(2)} is below hurdle rate ${criteria.minOosSharpeRatio.toFixed(2)}`,
    );
  }
  if (!flags.drawdownPassed) {
    failures.push(
      `Out-of-sample max drawdown of ${(metrics.observedMaxDrawdown * 100).toFixed(1)}% exceeds allowable ceiling of ${(criteria.maxDrawdown * 100).toFixed(1)}%`,
    );
  }
  if (!flags.regimeConsistencyPassed) {
    failures.push(
      `Regime consistency score of ${metrics.regimeConsistencyScore.toFixed(2)} is below minimum ${criteria.minRegimeConsistencyScore.toFixed(2)}`,
    );
  }
  if (!flags.costStressConservativePassed) {
    failures.push(
      `Net PnL collapses to ${metrics.conservativeStressPnl.toFixed(4)} under CONSERVATIVE cost stress (${criteria.conservativeFrictionBps} bps friction). Strategy is a fee trap.`,
    );
  }
  if (!flags.costStressAdversePassed) {
    failures.push(
      `Net PnL collapses to ${metrics.adverseStressPnl.toFixed(4)} under ADVERSE cost stress (${criteria.adverseFrictionBps} bps friction). Insufficient margin for adverse execution conditions.`,
    );
  }
  return failures;
}
