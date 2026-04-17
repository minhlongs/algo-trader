/**
 * Performance calculation for the Dry-Run (Paper Trading) Executor.
 * Extracted from dry-run-executor.ts for modularization.
 */

import type { PaperAccount, PaperTrade, DryRunConfig, PerformanceMetrics } from './dry-run-executor-types.js';

/** Group trades by date and sum P&L per day. */
export function calculateDailyReturns(trades: PaperTrade[]): number[] {
  const dailyPnl = new Map<string, number>();
  for (const trade of trades) {
    const date = new Date(trade.timestamp).toISOString().split('T')[0];
    dailyPnl.set(date, (dailyPnl.get(date) || 0) + (trade.pnl || 0));
  }
  return Array.from(dailyPnl.values());
}

/** Calculate performance metrics from account state and trade history. */
export function calcPerformanceMetrics(
  account: PaperAccount,
  trades: PaperTrade[],
  initialBalance: number,
): PerformanceMetrics {
  const totalReturn = account.realizedPnl + account.unrealizedPnl;
  const totalReturnPercent = (totalReturn / initialBalance) * 100;
  const winRate = account.totalTrades > 0
    ? (account.winningTrades / account.totalTrades) * 100
    : 0;

  const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
  const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
  const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

  // Simple Sharpe (annualized, assuming daily returns)
  const dailyReturns = calculateDailyReturns(trades);
  const avgReturn = dailyReturns.length > 0
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0;
  const stdDev = Math.sqrt(
    dailyReturns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / dailyReturns.length
  ) || 1;
  const sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252);

  return { totalReturn, totalReturnPercent, winRate, profitFactor, sharpeRatio };
}
