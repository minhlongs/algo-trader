/**
 * Type definitions for the Dry-Run (Paper Trading) Executor.
 * Shared across dry-run-executor and dry-run-executor-performance modules.
 */

export interface DryRunConfig {
  initialBalance: number;
  slippagePercent: number;
  feePercent: number;
  simulateFillRate: number; // 0-1, probability of order fill
}

export interface PaperPosition {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  requestedPrice: number;
  executedPrice: number;
  fee: number;
  slippage: number;
  status: 'filled' | 'rejected' | 'pending';
  timestamp: number;
  pnl?: number;
}

export interface PaperAccount {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export interface ExecutionResult {
  success: boolean;
  trade?: PaperTrade;
  message?: string;
  account?: PaperAccount;
}

export interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
}
