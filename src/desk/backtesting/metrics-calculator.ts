/**
 * Metrics Calculator
 *
 * Pure functions for computing backtesting metrics. No side effects, no I/O.
 * Delegates max drawdown computation to the shared BacktestRunner for consistency
 * across desk and platform backtesting modules.
 */

import type { MetricsReport, BacktestTrade } from './types';
import { BacktestRunner } from '../../shared/backtesting/backtest-runner';

// ── Public API ─────────────────────────────────────────────────────────────────

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

// ── Individual Metrics (exported for testing) ──────────────────────────────────

/**
 * Compute maximum drawdown from equity curve.
 * Delegates to shared BacktestRunner for consistent formula across modules.
 * Returns negative values (e.g., -0.25 = -25%) per desk convention.
 */
export function computeMaxDrawdown(equityCurve: Array<{ equity: number }>): number {
  if (equityCurve.length < 2) return 0;
  const equityValues = equityCurve.map((p) => p.equity);
  // Shared runner returns positive (0.25 = 25%), desk convention is negative
  const raw = BacktestRunner.computeMaxDrawdown(equityValues);
  // Avoid negative zero from -0; normalize to 0
  return raw === 0 ? 0 : -raw;
}

export function computeSharpeRatio(
  equityCurve: Array<{ equity: number }>,
  riskFreeRate = 0,
  ticksPerYear = 8760, // Default: hourly ticks (365 × 24)
): number {
  if (equityCurve.length < 2) return 0;

  // Per-tick returns from equity curve
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev === 0) continue;
    returns.push((equityCurve[i].equity - prev) / prev);
  }

  if (returns.length < 2) return 0;

  // Compute Sharpe directly with correct annualization factor
  // Annualized = (mean(r) - rf) / std(r) × sqrt(ticksPerYear)
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;

  const riskFreePerTick = riskFreeRate / ticksPerYear;
  return ((mean - riskFreePerTick) / std) * Math.sqrt(ticksPerYear);
}

export function computeProfitFactor(trades: Array<{ pnl: number | null }>): number {
  const closed = trades.filter((t) => t.pnl !== null);
  const grossProfit = closed
    .filter((t) => t.pnl! > 0)
    .reduce((sum, t) => sum + t.pnl!, 0);
  const grossLoss = Math.abs(
    closed.filter((t) => t.pnl! < 0).reduce((sum, t) => sum + t.pnl!, 0),
  );

  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
