/**
 * Alpha Lifecycle Metrics & Gate Evaluation Extraction Helpers
 */

import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { PromotionReadiness } from '../gates/gate-types';
import { evaluateGates } from '../gates/gate-evaluator-core';
import { computeMetrics } from '../../desk/backtesting/metrics-calculator';
import { computeDaysSinceStart, computeOosGap } from '../gates/gate-evaluator-rules';
import type { AlphaLifecycleState, GateEvaluationMetrics } from './alpha-lifecycle-state-types';

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

export interface LifecycleEvaluationOutcome {
  action: 'RETIRE' | 'QUARANTINE' | 'PROMOTE' | 'NONE';
  reason: string;
  metrics: GateEvaluationMetrics;
  verdict: PromotionReadiness;
}

export function evaluateLifecycleGates(
  gateInput: GateEvaluatorInput,
  currentState: AlphaLifecycleState,
): LifecycleEvaluationOutcome {
  const verdict = evaluateGates(gateInput);
  const metrics = extractGateMetrics(gateInput);

  if (currentState === 'RETIRED') {
    return { action: 'NONE', reason: 'Already RETIRED', metrics, verdict };
  }

  const isSevereDrawdownBreach = Math.abs(metrics.maxDrawdown) > 0.15;
  const isExpectancyBreach = metrics.tradeCount >= 15 && metrics.totalNetPnl < 0 && metrics.winRate < 0.45;
  const oosDivergence = metrics.oosGap ?? metrics.oosConsistency ?? null;
  const isOosBreach = oosDivergence !== null && oosDivergence > 0.10;

  if (isSevereDrawdownBreach || isExpectancyBreach || isOosBreach) {
    const reason = isSevereDrawdownBreach
      ? `Drawdown breach: ${(Math.abs(metrics.maxDrawdown) * 100).toFixed(2)}% > 15.00% threshold`
      : isExpectancyBreach
        ? `Persistent negative expectancy: PnL $${metrics.totalNetPnl.toFixed(2)}, win rate ${(metrics.winRate * 100).toFixed(1)}% < 45.0%`
        : `OOS consistency divergence: gap ${oosDivergence?.toFixed(4)} > 0.10 threshold`;
    return { action: 'RETIRE', reason, metrics, verdict };
  }

  if (Math.abs(metrics.maxDrawdown) >= 0.10 && (currentState === 'PAPER_ACTIVE' || currentState === 'PROMOTED_LIVE_ELIGIBLE')) {
    const reason = `Drawdown circuit breaker: ${(Math.abs(metrics.maxDrawdown) * 100).toFixed(2)}% >= 10.00%`;
    return { action: 'QUARANTINE', reason, metrics, verdict };
  }

  if (currentState === 'PAPER_ACTIVE' && verdict.allPassed) {
    const reason = `All ${verdict.totalGates} canonical gates passed: eligible for live handoff`;
    return { action: 'PROMOTE', reason, metrics, verdict };
  }

  return { action: 'NONE', reason: 'No transition threshold met', metrics, verdict };
}
