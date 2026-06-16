/**
 * Strategy Interface
 * All trading strategies must implement this interface
 */

export interface IStrategy {
  /**
   * Strategy metadata
   */
  readonly name: string;
  readonly version: string;
  readonly category: string;

  /**
   * Execute strategy on market data
   * Returns trading signal with confidence level
   */
  execute(marketData: Record<string, unknown>): Promise<StrategySignal>;

  /**
   * Optional: Tick-based execution for streaming data
   */
  onTick?(tick: MarketTick): StrategySignal;

  /**
   * Optional: Initialize strategy with capital/config
   */
  initialize?(config: StrategyConfig): Promise<void>;

  /**
   * Optional: Cleanup resources
   */
  shutdown?(): Promise<void>;
}

/**
 * Trading signal produced by strategies
 */
export interface StrategySignal {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0.0 - 1.0
  metadata?: {
    entryPrice?: number;
    targetPrice?: number;
    stopLoss?: number;
    positionSize?: number;
    [key: string]: unknown;
  };
}

/**
 * Market tick data
 */
export interface MarketTick {
  symbol: string;
  timestamp: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
  capitalUsdt: number;
  maxPositionSize?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  maxConcurrentTrades?: number;
  [key: string]: unknown;
}

/**
 * Strategy execution context
 */
export interface StrategyContext {
  strategyId: string;
  shardId: number;
  tenantId?: string;
  requestId: string;
}
