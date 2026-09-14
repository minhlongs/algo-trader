/**
 * Backtest Runner — Core Engine
 *
 * Computes performance metrics from trade history for marketplace backtesting.
 * Portfolio-agnostic: accepts any list of trades with P&L, entry/exit timestamps.
 *
 * Metrics: Sharpe ratio, max drawdown, win rate, profit factor, volatility, equity curve.
 */

import {
  type BacktestTrade,
  type BacktestConfig,
  type BacktestResult,
} from './backtest-runner-types';
import {
  computeSharpe,
  computeAnnualVolatility,
  computeMaxDrawdown,
  runBacktest,
  emptyResult,
} from './backtest-runner-engine';

export * from './backtest-runner-types';
export * from './backtest-runner-engine';

export class BacktestRunner {
  /**
   * Run backtest from a list of trades and compute all performance metrics.
   */
  static run(trades: BacktestTrade[], config: Partial<BacktestConfig> = {}): BacktestResult {
    return runBacktest(trades, config);
  }

  /**
   * Compute annualized Sharpe ratio from per-trade returns.
   * Sharpe = (mean(dailyReturn) - riskFreeDaily) / std(dailyReturn) × sqrt(252)
   */
  static computeSharpe(returns: number[], riskFreeAnnual: number = 0.05): number {
    return computeSharpe(returns, riskFreeAnnual);
  }

  /**
   * Annualized volatility from per-trade returns.
   */
  static computeAnnualVolatility(returns: number[]): number {
    return computeAnnualVolatility(returns);
  }

  /**
   * Compute maximum drawdown from equity curve.
   */
  static computeMaxDrawdown(equityCurve: number[]): number {
    return computeMaxDrawdown(equityCurve);
  }

  // Backward-compatible private helper
  private static emptyResult(capital: number): BacktestResult {
    return emptyResult(capital);
  }
}
