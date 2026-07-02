/**
 * Backtest Runner — Core Engine
 *
 * Computes performance metrics from trade history for marketplace backtesting.
 * Portfolio-agnostic: accepts any list of trades with P&L, entry/exit timestamps.
 *
 * Metrics: Sharpe ratio, max drawdown, win rate, profit factor, volatility, equity curve.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BacktestTrade {
  entryTimestamp: number;
  exitTimestamp: number;
  pnlUsd: number;          // realized P&L (positive = win, negative = loss)
  entryPrice: number;
  exitPrice: number;
  size: number;
  side: 'buy' | 'sell';
  marketId?: string;
}

export interface BacktestConfig {
  initialCapitalUsd: number;
  /** Risk-free rate for Sharpe (default 0.05 = 5% annual) */
  riskFreeRateAnnual: number;
}

export interface BacktestResult {
  sharpeRatio: number;
  maxDrawdown: number;      // 0–1 fraction (0.15 = 15%)
  winRate: number;           // 0–1 fraction
  totalPnlUsd: number;
  profitFactor: number;      // grossProfit / grossLoss
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWinUsd: number;
  avgLossUsd: number;
  volatilityAnnual: number;  // annualized std dev of returns
  equityCurve: number[];     // equity after each trade
  finalEquity: number;
  maxEquity: number;
  minEquity: number;
  totalReturn: number;       // 0–1 fraction
}

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapitalUsd: 10_000,
  riskFreeRateAnnual: 0.05,
};

// ── Engine ─────────────────────────────────────────────────────────────────────

export class BacktestRunner {
  /**
   * Run backtest from a list of trades and compute all performance metrics.
   */
  static run(trades: BacktestTrade[], config: Partial<BacktestConfig> = {}): BacktestResult {
    const cfg: BacktestConfig = { ...DEFAULT_CONFIG, ...config };

    if (trades.length === 0) {
      return BacktestRunner.emptyResult(cfg.initialCapitalUsd);
    }

    // Sort trades by exit timestamp
    const sorted = [...trades].sort((a, b) => a.exitTimestamp - b.exitTimestamp);

    // Build equity curve
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

      // Track drawdown
      if (equity > maxEquity) {
        maxEquity = equity;
      }
      if (equity < minEquity) {
        minEquity = equity;
      }
      const drawdown = maxEquity > 0 ? (maxEquity - equity) / maxEquity : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }

      // Daily return (approximate — use trade P&L as return)
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

    // Sharpe ratio: (mean(dailyReturn) - riskFreeDaily) / std(dailyReturn) * sqrt(252)
    const sharpeRatio = BacktestRunner.computeSharpe(dailyReturns, cfg.riskFreeRateAnnual);

    // Annualized volatility: std(dailyReturn) * sqrt(252)
    const volatilityAnnual = BacktestRunner.computeAnnualVolatility(dailyReturns);

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

  /**
   * Compute annualized Sharpe ratio from per-trade returns.
   * Sharpe = (mean(dailyReturn) - riskFreeDaily) / std(dailyReturn) × sqrt(252)
   */
  static computeSharpe(returns: number[], riskFreeAnnual: number = 0.05): number {
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
  static computeAnnualVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    const n = returns.length;
    const mean = returns.reduce((s, r) => s + r, 0) / n;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
    return Math.sqrt(variance) * Math.sqrt(252);
  }

  /**
   * Compute maximum drawdown from equity curve.
   */
  static computeMaxDrawdown(equityCurve: number[]): number {
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  private static emptyResult(capital: number): BacktestResult {
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
}
