/**
 * Baseline Runner
 *
 * Runs all baseline strategies on a dataset and produces evaluation reports.
 * Wraps baseline strategies with computeMetrics so they compare apples-to-apples
 * against candidate strategies.
 */

import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import type { CandleLike } from '../regimes/regime-types';
import { buildEquityCurve } from '../shared/equity-curve';
import { buyAndHold } from './baseline-strategies';
import { randomEntry } from './baseline-strategies';
import { simpleMomentum } from './baseline-strategies';
import { simpleMeanReversion } from './baseline-strategies';

/** Result of a baseline run with metrics attached. */
export interface BaselineRun {
  name: string;
  /** Cumulative equity curve for this baseline (price baseline + accumulated PnL). */
  equityCurve: { timestamp: string; equity: number }[];
  report: ReturnType<typeof computeMetrics>;
}

/**
 * Run all four baselines on a candle dataset.
 *
 * Returns reports that can be compared against experiment results.
 */
export function runAllBaselines(
  candles: CandleLike[],
  costFeeBps = 5,
  costSlippageBps = 2,
  seed = 42,
): BaselineRun[] {
  const closes = candles.map((c) => ({ timestamp: c.timestamp, close: c.close }));

  const strategies = [
    buyAndHold(closes, { cost: { feeBps: costFeeBps, slippageBps: costSlippageBps }, seed }),
    randomEntry(closes, { cost: { feeBps: costFeeBps, slippageBps: costSlippageBps }, seed }),
    simpleMomentum(closes, { cost: { feeBps: costFeeBps, slippageBps: costSlippageBps }, seed }),
    simpleMeanReversion(closes, { cost: { feeBps: costFeeBps, slippageBps: costSlippageBps }, seed }),
  ];

  return strategies.map((result) => {
    // Build equity curve from cumulative trade PnL so Sharpe/drawdown
    // reflect strategy returns, not the raw price series.
    const equity = buildEquityCurve(closes, result.trades);
    return {
      name: result.name,
      equityCurve: equity,
      report: computeMetrics(result.trades, equity),
    };
  });
}