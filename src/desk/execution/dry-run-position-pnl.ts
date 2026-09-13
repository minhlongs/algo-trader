/**
 * Dry-Run Position Performance & PnL
 * Sharpe ratio, profit factor, win rate, and daily return aggregations
 */

import type { PaperAccount, PaperTrade, PerformanceMetrics } from './dry-run-position-types';

export function calculateDailyReturns(trades: PaperTrade[]): number[] {
  const dailyPnl = new Map<string, number>();
  for (const trade of trades) {
    const date = new Date(trade.timestamp).toISOString().split('T')[0];
    const current = dailyPnl.get(date) || 0;
    dailyPnl.set(date, current + (trade.pnl || 0));
  }
  return Array.from(dailyPnl.values());
}

export function computePerformance(
  account: PaperAccount,
  initialBalance: number,
  trades: PaperTrade[],
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
