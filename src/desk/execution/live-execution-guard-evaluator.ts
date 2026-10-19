/**
 * Live Execution Guard Evaluator — Pure Evaluation Functions for Risk Checks
 */

import type { LivePositionTracker } from './live-position-tracker';
import type { PolymarketOrder } from './polymarket-signer';
import type { GuardConfig, GuardChecks, GuardResult } from './live-execution-guard-types';

export interface CheckEvaluationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Check 1: Circuit breaker — check FIRST (catastrophic stop)
 */
export function evaluateCircuitBreakerCheck(
  circuitTripped: boolean,
  maxConsecutiveLosses: number
): CheckEvaluationResult {
  if (circuitTripped) {
    return {
      ok: false,
      reason: `Circuit breaker tripped after ${maxConsecutiveLosses} consecutive losses. Trading halted.`,
    };
  }
  return { ok: true };
}

/**
 * Check 2: Position size check
 */
export function evaluatePositionSizeCheck(
  orderSizeUsd: number,
  capitalUsdc: number,
  maxPositionFraction: number
): CheckEvaluationResult {
  const maxPositionUsd = capitalUsdc * maxPositionFraction;
  if (orderSizeUsd > maxPositionUsd) {
    return {
      ok: false,
      reason: `Order size $${orderSizeUsd.toFixed(2)} exceeds max position $${maxPositionUsd.toFixed(2)} (${(maxPositionFraction * 100).toFixed(0)}% of capital)`,
    };
  }
  return { ok: true };
}

/**
 * Check 3: Daily drawdown check
 */
export function evaluateDailyDrawdownCheck(
  dailyPnl: number,
  capitalUsdc: number,
  maxDailyDrawdown: number
): CheckEvaluationResult {
  const drawdownFraction = capitalUsdc > 0
    ? Math.abs(Math.min(0, dailyPnl)) / capitalUsdc
    : 0;
  if (drawdownFraction >= maxDailyDrawdown) {
    return {
      ok: false,
      reason: `Daily drawdown ${(drawdownFraction * 100).toFixed(1)}% exceeds limit ${(maxDailyDrawdown * 100).toFixed(0)}%`,
    };
  }
  return { ok: true };
}

/**
 * Check 4: Concurrent positions check
 */
export function evaluateConcurrentPositionsCheck(
  openCount: number,
  maxConcurrentPositions: number
): CheckEvaluationResult {
  if (openCount >= maxConcurrentPositions) {
    return {
      ok: false,
      reason: `Open positions (${openCount}) at max (${maxConcurrentPositions})`,
    };
  }
  return { ok: true };
}

/**
 * Check 5: Aggregate exposure check
 */
export function evaluateAggregateExposureCheck(
  currentTotalExposureUsd: number,
  orderSizeUsd: number,
  capitalUsdc: number,
  maxAggregateExposureFraction: number
): CheckEvaluationResult {
  const maxAggregateExposureUsd = capitalUsdc * maxAggregateExposureFraction;
  const projectedExposureUsd = currentTotalExposureUsd + orderSizeUsd;
  if (projectedExposureUsd > maxAggregateExposureUsd) {
    return {
      ok: false,
      reason: `Projected aggregate exposure $${projectedExposureUsd.toFixed(2)} exceeds max allowable $${maxAggregateExposureUsd.toFixed(2)} (${(maxAggregateExposureFraction * 100).toFixed(0)}% of capital)`,
    };
  }
  return { ok: true };
}

export function evaluateGuardOrder(
  order: PolymarketOrder,
  config: GuardConfig,
  circuitTripped: boolean,
  dailyPnl: number,
  positionTracker: LivePositionTracker | null,
): GuardResult {
  const checks: GuardChecks = {
    positionSizeOk: true,
    dailyDrawdownOk: true,
    concurrentLimitOk: true,
    circuitBreakerOk: true,
    aggregateExposureOk: true,
  };
  if (!config.enabled) return { approved: true, checks };

  const cbCheck = evaluateCircuitBreakerCheck(circuitTripped, config.maxConsecutiveLosses);
  if (!cbCheck.ok) return { approved: false, reason: cbCheck.reason, checks: { ...checks, circuitBreakerOk: false } };

  const orderSizeUsd = order.size * order.price;
  const posCheck = evaluatePositionSizeCheck(orderSizeUsd, config.capitalUsdc, config.maxPositionFraction);
  if (!posCheck.ok) return { approved: false, reason: posCheck.reason, checks: { ...checks, positionSizeOk: false } };

  const ddCheck = evaluateDailyDrawdownCheck(dailyPnl, config.capitalUsdc, config.maxDailyDrawdown);
  if (!ddCheck.ok) return { approved: false, reason: ddCheck.reason, checks: { ...checks, dailyDrawdownOk: false } };

  if (positionTracker) {
    const cpCheck = evaluateConcurrentPositionsCheck(positionTracker.getPositions().length, config.maxConcurrentPositions);
    if (!cpCheck.ok) return { approved: false, reason: cpCheck.reason, checks: { ...checks, concurrentLimitOk: false } };

    if (config.maxAggregateExposureFraction !== undefined) {
      const aggCheck = evaluateAggregateExposureCheck(
        positionTracker.getSummary().totalExposure, orderSizeUsd, config.capitalUsdc, config.maxAggregateExposureFraction,
      );
      if (!aggCheck.ok) return { approved: false, reason: aggCheck.reason, checks: { ...checks, aggregateExposureOk: false } };
    }
  }
  return { approved: true, checks };
}

