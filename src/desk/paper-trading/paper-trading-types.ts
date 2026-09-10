/**
 * Types, interfaces, and state constants for paper trading loop.
 */

/** Minimal D1Database interface matching Cloudflare D1 binding shape. */
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1Result>;
}

export interface D1Result {
  success: boolean;
}

export type KVStore = {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

/** Cast from the worker's typed KVNamespace binding (compatible runtime shape). */
export function asKVStore(kv: unknown): KVStore | undefined {
  return kv as KVStore | undefined;
}

/** KV key for paper trading loop state. */
export const STATE_KEY = 'paper-trading-loop-state';

export interface PaperTradingConfig {
  readonly symbols: string[];
  readonly timeframe: string;
  readonly intervalMs: number;
  readonly maxConcurrentTrades: number;
  readonly holdDurationMs?: number;
}

export interface PaperTradeRecord {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  sizeUsd: number;
  entryPrice: number;
  exitPrice?: number;
  pnlUsd?: number;
  openedAt: number;
  closedAt?: number;
  isPaper?: boolean;
  durationMs?: number;
  persistedToDb?: boolean;
}

export interface PaperTradingStatus {
  isRunning: boolean;
  running: boolean;
  openTrades: number;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlUsd: number;
  startTime?: number;
}
