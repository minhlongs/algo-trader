/**
 * Risk-Managed Kelly Strategy — Risk Checks & Position Updates
 */

import type {
  Position,
  RiskMetrics,
  RiskCheck,
  TrailingStopResult,
  WinStats,
} from './risk-managed-kelly-types';

/**
 * Check all risk limits (daily loss + drawdown)
 */
export function checkRiskLimits(
  metrics: RiskMetrics,
  dailyLossLimitUsd: number,
  maxDrawdownPercent: number,
): RiskCheck {
  if (Math.abs(metrics.dailyPnL) > dailyLossLimitUsd && metrics.dailyPnL < 0) {
    return { pass: false, reason: `Daily loss limit hit: ${metrics.dailyPnL.toFixed(2)}` };
  }

  const drawdown = calculateDrawdown(metrics.peakBalance, metrics.currentBalance);
  if (drawdown > maxDrawdownPercent) {
    return { pass: false, reason: `Max drawdown hit: ${(drawdown * 100).toFixed(2)}%` };
  }

  return { pass: true };
}

/**
 * Calculate current drawdown from peak
 */
export function calculateDrawdown(peakBalance: number, currentBalance: number): number {
  return (peakBalance - currentBalance) / peakBalance;
}

/**
 * Check if trailing stop should trigger
 */
export function checkTrailingStop(
  position: Position,
  currentPrice: number,
  trailingStopPercent: number,
): TrailingStopResult {
  let stopPrice: number;

  if (position.side === 'long') {
    const trailPrice = currentPrice * (1 - trailingStopPercent);
    stopPrice = Math.max(position.stopLoss, trailPrice);
    if (currentPrice <= stopPrice) {
      return { triggered: true, metadata: { stopPrice, pnl: currentPrice - position.entryPrice } };
    }
  } else {
    const trailPrice = currentPrice * (1 + trailingStopPercent);
    stopPrice = Math.min(position.stopLoss, trailPrice);
    if (currentPrice >= stopPrice) {
      return { triggered: true, metadata: { stopPrice, pnl: position.entryPrice - currentPrice } };
    }
  }

  return { triggered: false };
}

/**
 * Compute position close result — returns updated metrics (does NOT mutate)
 */
export function closePositionResult(
  position: Position,
  exitPrice: number,
  metrics: RiskMetrics,
  recentTrades: Array<{ pnl: number; timestamp: number }>,
): {
  updatedMetrics: RiskMetrics;
  updatedTrades: Array<{ pnl: number; timestamp: number }>;
  pnl: number;
} {
  let pnl = 0;
  if (position.side === 'long') {
    pnl = (exitPrice - position.entryPrice) * position.size;
  } else {
    pnl = (position.entryPrice - exitPrice) * position.size;
  }

  const now = Date.now();
  const updatedMetrics: RiskMetrics = {
    dailyPnL: metrics.dailyPnL + pnl,
    currentBalance: metrics.currentBalance + pnl,
    peakBalance: Math.max(metrics.peakBalance, metrics.currentBalance + pnl),
    openPosition: null,
  };

  const updatedTrades = [
    ...recentTrades,
    { pnl, timestamp: now },
  ].filter((t) => now - t.timestamp < 24 * 60 * 60 * 1000);

  return { updatedMetrics, updatedTrades, pnl };
}

/**
 * Update win rate and win/loss ratio from recent trades
 */
export function updateWinStats(recentTrades: Array<{ pnl: number; timestamp: number }>): WinStats {
  if (recentTrades.length < 5) return { winRate: 0.6, winLossRatio: 1.5 };

  const wins = recentTrades.filter((t) => t.pnl > 0);
  const losses = recentTrades.filter((t) => t.pnl <= 0);

  const winRate = wins.length / recentTrades.length;

  let winLossRatio = 1.5;
  if (losses.length > 0) {
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + Math.abs(b.pnl), 0) / wins.length : 0;
    const avgLoss = losses.reduce((a, b) => a + Math.abs(b.pnl), 0) / losses.length;
    winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 1.5;
  }

  return { winRate, winLossRatio };
}
