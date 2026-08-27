/**
 * Trading Loop — shared type definitions + construction defaults
 * Extracted from trading-loop.ts (facade re-exports keep the public API stable)
 */

export interface TradingLoopConfig {
  symbols: string[];
  exchanges: ('binance' | 'okx' | 'bybit')[];
  minSpreadPercent: number;
  maxLatencyMs: number;
  enableDryRun: boolean;
  enableLogging: boolean;
  checkIntervalMs: number;
  /** EC#14: Max queued opportunities before dropping (default 50) */
  maxQueuedOpportunities?: number;
  /** EC#15: Default arbitrage amount in USD (default 1000) */
  defaultArbAmountUsd?: number;
  /** EC#15: Default fee rate (default 0.001 = 0.1%) */
  defaultFeeRate?: number;
  /** EC#16: Arbitrage opportunity TTL in ms (default 5000) */
  opportunityTtlMs?: number;
}

export interface TradingLoopMetrics {
  isRunning: boolean;
  uptimeMs: number;
  opportunitiesFound: number;
  opportunitiesExecuted: number;
  totalProfit: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastScanTime?: number;
  errors: number;
}

export interface TradingOpportunity {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
  spreadPercent: number;
  timestamp: number;
  latency: number;
  score?: number;
  confidence?: 'high' | 'medium' | 'low';
}

/** Apply constructor defaults (verbatim from the original TradingLoop constructor) */
export function defaultTradingLoopConfig(config: Partial<TradingLoopConfig> = {}): TradingLoopConfig {
  return {
    symbols: config.symbols || ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    exchanges: config.exchanges || ['binance', 'okx', 'bybit'],
    minSpreadPercent: config.minSpreadPercent || 0.05,
    maxLatencyMs: config.maxLatencyMs || 500,
    enableDryRun: config.enableDryRun ?? true,
    enableLogging: config.enableLogging ?? true,
    checkIntervalMs: config.checkIntervalMs || 100,
  };
}

/** Fresh zeroed metrics object (verbatim from the original TradingLoop field initializer) */
export function createInitialMetrics(): TradingLoopMetrics {
  return {
    isRunning: false,
    uptimeMs: 0,
    opportunitiesFound: 0,
    opportunitiesExecuted: 0,
    totalProfit: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    errors: 0,
  };
}
