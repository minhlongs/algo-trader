/**
 * Live Execution Guard Evaluator — Pure Evaluation Functions for Risk Checks
 */

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
