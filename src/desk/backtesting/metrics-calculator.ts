/**
 * Metrics Calculator
 *
 * Pure functions for computing backtesting metrics. No side effects, no I/O.
 * Delegates max drawdown computation to the shared BacktestRunner for consistency
 * across desk and platform backtesting modules.
 */

import type { MetricsReport, BacktestTrade } from './types';
import { BacktestRunner } from '../../shared/backtesting/backtest-runner';

export function computeMetrics(
  trades: BacktestTrade[],
  equityCurve: Array<{ timestamp: string; equity: number }>,
): MetricsReport {
  const closedTrades = trades.filter((t) => t.pnl !== null);
  const winningTrades = closedTrades.filter((t) => t.pnl! > 0);
  const losingTrades = closedTrades.filter((t) => t.pnl! < 0);

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
  const maxDrawdown = computeMaxDrawdown(equityCurve);
  const sharpeRatio = computeSharpeRatio(equityCurve);
  const profitFactor = computeProfitFactor(closedTrades);
  const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map((t) => t.pnl!)) : 0;
  const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map((t) => t.pnl!)) : 0;
  const avgPnlPerTrade = closedTrades.length > 0 ? totalPnl / closedTrades.length : 0;

  return {
    totalPnl: round4(totalPnl),
    sharpeRatio: round2(sharpeRatio),
    maxDrawdown: round4(maxDrawdown),
    winRate: round4(winRate),
    profitFactor: round2(profitFactor),
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    bestTrade: round4(bestTrade),
    worstTrade: round4(worstTrade),
    avgPnlPerTrade: round4(avgPnlPerTrade),
  };
}

/**
 * Compute maximum drawdown from equity curve.
 * Returns negative values (e.g., -0.25 = -25%) per desk convention.
 */
export function computeMaxDrawdown(equityCurve: Array<{ equity: number }>): number {
  if (equityCurve.length < 2) return 0;
  const raw = BacktestRunner.computeMaxDrawdown(equityCurve.map((p) => p.equity));
  return raw === 0 ? 0 : -raw;
}

export function computeSharpeRatio(
  equityCurve: Array<{ equity: number }>,
  riskFreeRate = 0,
  ticksPerYear = 8760,
): number {
  if (equityCurve.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev !== 0) returns.push((equityCurve[i].equity - prev) / prev);
  }
  if (returns.length < 2) return 0;

  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;

  return ((mean - riskFreeRate / ticksPerYear) / std) * Math.sqrt(ticksPerYear);
}

export function computeProfitFactor(trades: Array<{ pnl: number | null }>): number {
  const closed = trades.filter((t) => t.pnl !== null);
  const grossProfit = closed.filter((t) => t.pnl! > 0).reduce((sum, t) => sum + t.pnl!, 0);
  const grossLoss = Math.abs(closed.filter((t) => t.pnl! < 0).reduce((sum, t) => sum + t.pnl!, 0));

  if (grossLoss === 0) return grossProfit > 0 ? 100.0 : 0;
  return Math.min(grossProfit / grossLoss, 100.0);
}

/**
 * Compute annualized Sortino ratio from returns or equity curve.
 */
export function computeSortinoRatio(
  returnsOrEquity: number[] | Array<{ equity: number }>,
  targetReturn = 0,
  ticksPerYear = 8760,
): number {
  if (!returnsOrEquity || returnsOrEquity.length < 2) return 0;

  let returns: number[];
  if (typeof returnsOrEquity[0] === 'number') {
    returns = returnsOrEquity as number[];
  } else {
    const curve = returnsOrEquity as Array<{ equity: number }>;
    returns = [];
    for (let i = 1; i < curve.length; i++) {
      const prev = curve[i - 1].equity;
      if (prev !== 0) returns.push((curve[i].equity - prev) / prev);
    }
  }
  if (returns.length < 2) return 0;

  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const targetPerTick = targetReturn / ticksPerYear;

  const downsideSquaredSum = returns.reduce((sum, r) => {
    const diff = r - targetPerTick;
    return diff < 0 ? sum + diff * diff : sum;
  }, 0);

  const downsideDeviation = Math.sqrt(downsideSquaredSum / n);
  if (downsideDeviation === 0) return mean > targetPerTick ? 50.0 : 0;

  return Math.min(((mean - targetPerTick) / downsideDeviation) * Math.sqrt(ticksPerYear), 50.0);
}

/**
 * Compute Calmar ratio from annualized return and max drawdown.
 */
export function computeCalmarRatio(annualizedReturn: number, maxDrawdown: number): number {
  if (isNaN(annualizedReturn) || isNaN(maxDrawdown)) return 0;
  const absDd = Math.abs(maxDrawdown);
  if (absDd === 0) return annualizedReturn > 0 ? 50.0 : 0;
  return Math.min(annualizedReturn / absDd, 50.0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
