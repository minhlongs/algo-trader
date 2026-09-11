/**
 * Paper Position P&L
 * Pure functions for Sharpe ratio, max drawdown, and P&L summary computation.
 */

import type { PaperTrade, PaperAccount, PnlSummary } from './paper-position-types';

export function calcSharpeRatio(tradeHistory: PaperTrade[]): number {
  const daily = new Map<string, number>();
  for (const t of tradeHistory) {
    const day = new Date(t.timestamp).toISOString().split('T')[0]!;
    daily.set(day, (daily.get(day) ?? 0) + (t.pnl ?? 0));
  }
  const vals = Array.from(daily.values());
  if (vals.length < 2) return 0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.map((v) => (v - avg) ** 2).reduce((a, b) => a + b, 0) / vals.length);
  if (std === 0) return 0;
  return (avg / std) * Math.sqrt(252);
}

export function calcMaxDrawdown(initialBalance: number, tradeHistory: PaperTrade[]): number {
  let peak = initialBalance;
  let maxDd = 0;
  let equity = initialBalance;
  for (const t of tradeHistory) {
    equity += t.pnl ?? 0;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function computePnlSummary(
  account: PaperAccount,
  tradeHistory: PaperTrade[],
  initialBalance: number,
): PnlSummary {
  const wins = tradeHistory.filter((t) => (t.pnl ?? 0) > 0);
  const losses = tradeHistory.filter((t) => (t.pnl ?? 0) < 0);
  const totalWins = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const totalPnl = account.realizedPnl + account.unrealizedPnl;
  const winRate = account.totalTrades > 0 ? (account.winningTrades / account.totalTrades) * 100 : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
  const sharpe = calcSharpeRatio(tradeHistory);
  const maxDd = calcMaxDrawdown(initialBalance, tradeHistory);
  return {
    totalPnl, winRate, totalTrades: account.totalTrades,
    winningTrades: account.winningTrades, losingTrades: account.losingTrades,
    profitFactor, sharpeRatio: sharpe, maxDrawdown: maxDd,
    balance: account.balance, equity: account.equity,
  };
}
