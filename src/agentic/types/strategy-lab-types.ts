/** Strategy lab types for backtest and ranking */

export interface BacktestResult {
  strategyId: string;
  sharpe: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  passed: boolean;
}

export interface StrategyRankEntry {
  strategyId: string;
  sharpe: number;
  winRate: number;
  rank: number;
}
