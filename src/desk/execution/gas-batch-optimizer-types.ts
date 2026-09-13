/**
 * Types and interfaces for Gas Batch Optimizer
 */

/** A single trade to be batched */
export interface PendingTrade {
  id: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  /** Optional metadata passed through to result */
  meta?: Record<string, unknown>;
}

/** Result for one trade after batch (or individual) execution */
export interface TradeResult {
  tradeId: string;
  success: boolean;
  orderId?: string;
  error?: string;
  executedViaBatch: boolean;
}

/** Callback to execute a batch of trades — injected by caller */
export type BatchExecutor = (trades: PendingTrade[]) => Promise<TradeResult[]>;

/** Callback to execute a single trade (fallback) */
export type SingleExecutor = (trade: PendingTrade) => Promise<TradeResult>;

export interface BatchOptimizerConfig {
  /** Milliseconds to wait before flushing (default: 5000) */
  windowMs?: number;
  /** Max trades per batch before forcing flush (default: 10) */
  maxBatchSize?: number;
}
