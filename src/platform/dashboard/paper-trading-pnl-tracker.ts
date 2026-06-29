/** Paper Trading P&L Tracker — computes rolling performance metrics and exposes Prometheus gauges.
 * Pure computation: accepts PaperPortfolio as input, no DB or file I/O. */

import client from 'prom-client';
import type { PaperPortfolio, PaperTrade } from '../../wiring/paper-trading-orchestrator';
import { register } from '../middleware/prometheus-metrics';

// ─── Public Interfaces ────────────────────────────────────────────────────────

export interface PnlSnapshot {
  timestamp: number;
  totalPnl: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openPositions: number;
  closedTrades: number;
  winRate: number;       // 0-1
  avgEdge: number;
  maxDrawdown: number;
  sharpeRatio: number;   // annualized, risk-free=0
  capitalRemaining: number;
}

export interface DailyPnl {
  date: string; // "2026-04-10"
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

// ─── Prometheus Gauge Instances ───────────────────────────────────────────────

let gauges: {
  pnl: client.Gauge;
  winRate: client.Gauge;
  openPositions: client.Gauge;
  maxDrawdown: client.Gauge;
  sharpeRatio: client.Gauge;
} | null = null;

// ─── Core Computations ────────────────────────────────────────────────────────

/** Estimate unrealized P&L for open positions using midpoint assumption (exitPrice = entryPrice). */
function computeUnrealizedPnl(positions: PaperTrade[]): number {
  // Without live prices, unrealized is 0 — positions have no settled P&L yet.
  // Callers with live prices can override by computing before passing portfolio.
  return positions.reduce((_acc, _p) => _acc + 0, 0);
}

/** Group closed trades by calendar date and aggregate per-day stats. */
export function computeDailyPnl(
  closedTrades: Array<PaperTrade & { exitPrice: number; pnl: number }>
): DailyPnl[] {
  const byDate = new Map<string, DailyPnl>();

  for (const trade of closedTrades) {
    const date = new Date(trade.timestamp).toISOString().slice(0, 10);
    const existing = byDate.get(date) ?? { date, pnl: 0, trades: 0, wins: 0, losses: 0 };
    existing.pnl += trade.pnl;
    existing.trades += 1;
    if (trade.pnl >= 0) { existing.wins++; } else { existing.losses++; }
    byDate.set(date, existing);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Compute peak-to-trough max drawdown from cumulative daily P&L series. Returns value as fraction (0-1). */
export function computeMaxDrawdown(dailyPnls: DailyPnl[]): number {
  if (dailyPnls.length === 0) return 0;

  let peak = 0;
  let cumulative = 0;
  let maxDd = 0;

  for (const day of dailyPnls) {
    cumulative += day.pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak > 0 ? (peak - cumulative) / peak : 0;
    if (drawdown > maxDd) maxDd = drawdown;
  }

  return maxDd;
}

/** Compute annualized Sharpe ratio from daily P&L series. Risk-free rate = 0. */
export function computeSharpeRatio(dailyPnls: DailyPnl[]): number {
  if (dailyPnls.length < 2) return 0;

  const returns = dailyPnls.map(d => d.pnl);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return 0;

  // Annualize assuming 252 trading days
  return (mean / stddev) * Math.sqrt(252);
}

/** Compute full P&L snapshot from current portfolio state. */
export function computePnlSnapshot(portfolio: PaperPortfolio): PnlSnapshot {
  const dailyPnls = computeDailyPnl(portfolio.closedTrades);
  const totalTrades = portfolio.winCount + portfolio.lossCount;

  // Average edge: mean of (pnl / size) across closed trades
  const avgEdge = portfolio.closedTrades.length > 0
    ? portfolio.closedTrades.reduce((s, t) => s + (t.pnl / Math.max(t.size, 0.0001)), 0)
      / portfolio.closedTrades.length
    : 0;

  return {
    timestamp: Date.now(),
    totalPnl: portfolio.totalPnl,
    unrealizedPnl: computeUnrealizedPnl(portfolio.positions),
    realizedPnl: portfolio.totalPnl,
    openPositions: portfolio.positions.length,
    closedTrades: portfolio.closedTrades.length,
    winRate: totalTrades > 0 ? portfolio.winCount / totalTrades : 0,
    avgEdge,
    maxDrawdown: computeMaxDrawdown(dailyPnls),
    sharpeRatio: computeSharpeRatio(dailyPnls),
    capitalRemaining: portfolio.capital,
  };
}

// ─── Prometheus Integration ───────────────────────────────────────────────────

/** Register custom Prometheus gauges for paper trading. Safe to call multiple times (idempotent). */
export function registerPaperTradingMetrics(): void {
  if (gauges !== null) return; // Already registered

  gauges = {
    pnl: new client.Gauge({
      name: 'paper_trading_pnl',
      help: 'Paper trading total P&L in USDC',
      registers: [register],
    }),
    winRate: new client.Gauge({
      name: 'paper_trading_win_rate',
      help: 'Paper trading win rate (0-1)',
      registers: [register],
    }),
    openPositions: new client.Gauge({
      name: 'paper_trading_open_positions',
      help: 'Number of currently open paper trading positions',
      registers: [register],
    }),
    maxDrawdown: new client.Gauge({
      name: 'paper_trading_max_drawdown',
      help: 'Paper trading maximum drawdown as fraction (0-1)',
      registers: [register],
    }),
    sharpeRatio: new client.Gauge({
      name: 'paper_trading_sharpe_ratio',
      help: 'Paper trading annualized Sharpe ratio (risk-free=0)',
      registers: [register],
    }),
  };
}

/** Update Prometheus gauges from a PnlSnapshot. Must call registerPaperTradingMetrics() first. */
export function updatePaperTradingMetrics(snapshot: PnlSnapshot): void {
  if (gauges === null) {
    registerPaperTradingMetrics();
  }

  // gauges is guaranteed non-null after registerPaperTradingMetrics()
  const g = gauges!;
  g.pnl.set(snapshot.totalPnl);
  g.winRate.set(snapshot.winRate);
  g.openPositions.set(snapshot.openPositions);
  g.maxDrawdown.set(snapshot.maxDrawdown);
  g.sharpeRatio.set(snapshot.sharpeRatio);
}
