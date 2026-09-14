/**
 * Types and default configuration for Backtest Runner.
 */

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

export const DEFAULT_CONFIG: BacktestConfig = {
  initialCapitalUsd: 10_000,
  riskFreeRateAnnual: 0.05,
};
