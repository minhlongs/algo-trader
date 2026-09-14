/**
 * Backtest Runner — Performance calculation engine.
 */

import {
  type BacktestTrade,
  type BacktestConfig,
  type BacktestResult,
  DEFAULT_CONFIG,
} from './backtest-runner-types';

/**
 * Compute annualized Sharpe ratio from per-trade returns.
 * Sharpe = (mean(dailyReturn) - riskFreeDaily) / std(dailyReturn) × sqrt(252)
 */
export function computeSharpe(returns: number[], riskFreeAnnual: number = 0.05): number {
  if (returns.length < 2) return 0;
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const riskFreeDaily = riskFreeAnnual / 252;
  return ((mean - riskFreeDaily) / std) * Math.sqrt(252);
}

/**
 * Annualized volatility from per-trade returns.
 */
export function computeAnnualVolatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const n = returns.length;
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * Compute maximum drawdown from equity curve.
 */
export function computeMaxDrawdown(equityCurve: number[]): number {
  if (equityCurve.length < 2) return 0;
  let peak = equityCurve[0];
  let maxDd = 0;
  for (const eq of equityCurve) {
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

export function emptyResult(capital: number): BacktestResult {
  return {
    sharpeRatio: 0,
    maxDrawdown: 0,
    winRate: 0,
    totalPnlUsd: 0,
    profitFactor: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    avgWinUsd: 0,
    avgLossUsd: 0,
    volatilityAnnual: 0,
    equityCurve: [capital],
    finalEquity: capital,
    maxEquity: capital,
    minEquity: capital,
    totalReturn: 0,
  };
}

/**
 * Run backtest simulation and compute performance metrics.
 */
export function runBacktest(trades: BacktestTrade[], config: Partial<BacktestConfig> = {}): BacktestResult {
  const cfg: BacktestConfig = { ...DEFAULT_CONFIG, ...config };

  if (trades.length === 0) {
    return emptyResult(cfg.initialCapitalUsd);
  }

  const sorted = [...trades].sort((a, b) => a.exitTimestamp - b.exitTimestamp);
  const equityCurve: number[] = [cfg.initialCapitalUsd];
  let equity = cfg.initialCapitalUsd;
  let maxEquity = equity;
  let minEquity = equity;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let winningTrades = 0;
  let losingTrades = 0;
  const dailyReturns: number[] = [];

  for (const trade of sorted) {
    equity += trade.pnlUsd;
    equityCurve.push(equity);

    if (trade.pnlUsd > 0) {
      winningTrades++;
      grossProfit += trade.pnlUsd;
    } else if (trade.pnlUsd < 0) {
      losingTrades++;
      grossLoss += Math.abs(trade.pnlUsd);
    }

    if (equity > maxEquity) maxEquity = equity;
    if (equity < minEquity) minEquity = equity;
    const drawdown = maxEquity > 0 ? (maxEquity - equity) / maxEquity : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    const prevEquity = equityCurve[equityCurve.length - 2] || cfg.initialCapitalUsd;
    if (prevEquity > 0) {
      dailyReturns.push(trade.pnlUsd / prevEquity);
    }
  }

  const finalEquity = equity;
  const totalPnlUsd = finalEquity - cfg.initialCapitalUsd;
  const totalReturn = cfg.initialCapitalUsd > 0 ? totalPnlUsd / cfg.initialCapitalUsd : 0;
  const totalTrades = sorted.length;
  const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const avgWinUsd = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLossUsd = losingTrades > 0 ? grossLoss / losingTrades : 0;

  const sharpeRatio = computeSharpe(dailyReturns, cfg.riskFreeRateAnnual);
  const volatilityAnnual = computeAnnualVolatility(dailyReturns);

  return {
    sharpeRatio,
    maxDrawdown,
    winRate,
    totalPnlUsd: Math.round(totalPnlUsd * 100) / 100,
    profitFactor: Math.round(profitFactor * 1e4) / 1e4,
    totalTrades,
    winningTrades,
    losingTrades,
    avgWinUsd: Math.round(avgWinUsd * 100) / 100,
    avgLossUsd: Math.round(avgLossUsd * 100) / 100,
    volatilityAnnual: Math.round(volatilityAnnual * 1e4) / 1e4,
    equityCurve,
    finalEquity,
    maxEquity,
    minEquity,
    totalReturn: Math.round(totalReturn * 1e4) / 1e4,
  };
}
