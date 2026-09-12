/**
 * P&L Summary and Performance Metrics Types
 */

export interface PnLSummary {
  date: string;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export interface PerformanceMetrics {
  totalPnl: number;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgTrade: number;
  bestTrade: number;
  worstTrade: number;
}
