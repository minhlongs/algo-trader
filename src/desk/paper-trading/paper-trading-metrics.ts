/**
 * Metrics calculation functions for paper trading loop.
 */

import type { PaperTradeRecord, PaperTradingStatus } from './paper-trading-types';

/** Compute win rate for closed trades (pnl > 0). Returns 0 if no closed trades. */
export function computeWinRate(trades: PaperTradeRecord[]): number {
  const closed = trades.filter((t) => t.exitPrice !== undefined);
  if (closed.length === 0) return 0;
  return closed.filter((t) => (t.pnlUsd ?? 0) > 0).length / closed.length;
}

/** Compute aggregate PnL across all recorded trades. */
export function computeTotalPnl(trades: PaperTradeRecord[]): number {
  return trades.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);
}

/** Build full status snapshot for the loop. */
export function buildLoopStatus(
  isRunning: boolean,
  trades: PaperTradeRecord[],
  startTime?: number
): PaperTradingStatus {
  const totalPnl = computeTotalPnl(trades);
  return {
    isRunning,
    running: isRunning,
    openTrades: trades.filter((t) => t.exitPrice === undefined).length,
    totalTrades: trades.length,
    winRate: computeWinRate(trades),
    totalPnl,
    totalPnlUsd: totalPnl,
    startTime,
  };
}
