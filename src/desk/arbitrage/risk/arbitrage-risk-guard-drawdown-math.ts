/**
 * Pure Drawdown Fraction, Tiered Breaker Evaluation, and Rejection Builder Helpers
 * for Arbitrage Risk Guard Drawdown Gate.
 *
 * @module desk/arbitrage/risk/arbitrage-risk-guard-drawdown-math
 */

import {
  type ArbitrageRiskGateChecks,
  type ArbitrageRiskCheckResult,
  ArbitrageRejectionReason,
} from './arbitrage-risk-types';

export function tripDrawdownRejection(
  checks: ArbitrageRiskGateChecks,
  details: Record<string, unknown>,
): ArbitrageRiskCheckResult {
  checks.drawdownBreakerOk = false;
  return {
    allowed: false,
    rejectionReason: ArbitrageRejectionReason.DRAWDOWN_BREAKER_TRIPPED,
    adjustedNotionalUsd: 0,
    checks,
    details,
  };
}

export function isExplicitDrawdownBreached(
  currentDrawdown: number | undefined,
  maxDailyDrawdownFraction: number,
): currentDrawdown is number {
  return currentDrawdown !== undefined && currentDrawdown >= maxDailyDrawdownFraction;
}

export function isTieredBreakerHalted(
  drawdownPercent: number,
  tier: string,
  canOpenNewTrades: boolean,
  maxDailyDrawdownFraction: number,
): boolean {
  const ddFrac = drawdownPercent / 100;
  return (
    ddFrac >= maxDailyDrawdownFraction ||
    !canOpenNewTrades ||
    tier === 'HALT' ||
    tier === 'HARD_STOP'
  );
}

export function computeGuardDailyDrawdownFraction(
  dailyPnl: number,
  capitalUsdc: number,
): number {
  return capitalUsdc > 0 ? Math.abs(Math.min(0, dailyPnl)) / capitalUsdc : 0;
}
