/**
 * Paper Position Types
 * Core interfaces, types, and the default account factory
 * for the paper trading subsystem.
 */

// ─── Core Interfaces ──────────────────────────────────────────────────────────

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

export interface PaperPosition {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  openedAt: number;
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

export interface PaperExecutorConfig {
  initialBalance: number;
  slippagePercent: number;
  feePercent: number;
  simulateFillRate: number; // 0-1 probability of fill
}

export interface TradeSignal {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
}

export interface PnlSummary {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  balance: number;
  equity: number;
}

// ─── Default Account Factory ──────────────────────────────────────────────────

export function createDefaultAccount(config: PaperExecutorConfig, initialBalance?: number): PaperAccount {
  return {
    balance: initialBalance ?? config.initialBalance,
    equity: initialBalance ?? config.initialBalance,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
  };
}
