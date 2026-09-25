/**
 * Alpha Lifecycle Metrics Extraction Helpers
 */

import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import { computeDaysSinceStart, computeOosGap } from '../gates/gate-evaluator-rules';
import type { GateEvaluationMetrics } from './alpha-lifecycle-state-types';

/**
 * Metric extraction helper from GateEvaluatorInput.
 */
export function extractGateMetrics(input: GateEvaluatorInput): GateEvaluationMetrics {
  const metrics = computeMetrics(input.trades, input.equityCurve);
  const daysActive = computeDaysSinceStart(input.startDate);
  const oosGap = computeOosGap(input.testWinRate, input.valWinRate);

  return {
    totalTrades: metrics.totalTrades,
    tradeCount: metrics.totalTrades,
    winRate: metrics.winRate,
    profitFactor: metrics.profitFactor,
    maxDrawdown: Math.abs(metrics.maxDrawdown),
    sharpeRatio: metrics.sharpeRatio,
    daysActive,
    oosGap,
    oosConsistency: oosGap,
    totalNetPnl: metrics.totalPnl,
    totalPnl: metrics.totalPnl,
  };
}
