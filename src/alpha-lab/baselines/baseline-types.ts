/**
 * Baseline Strategy Types
 *
 * Interfaces for baseline strategies that produce BacktestTrade arrays.
 * Used to compare candidate strategies against simple benchmarks.
 */

import type { BacktestTrade } from '../../desk/backtesting/types';

/** Cost parameters applied to all baseline trades. */
export interface BaselineCostConfig {
  feeBps: number;
  slippageBps: number;
}

/** Configuration shared by all baseline strategies. */
export interface BaselineConfig {
  cost: BaselineCostConfig;
  /** Seed for deterministic randomness (used by random entry). */
  seed: number;
}

/** Result of running a baseline strategy. */
export interface BaselineResult {
  name: string;
  trades: BacktestTrade[];
  totalTrades: number;
}

/** Buy & Hold: enter at start, exit at end. */
export interface BuyHoldConfig extends BaselineConfig {
  /** Bar index to enter. Default: 0. */
  entryIdx?: number;
}

/** Random Entry: buy/sell at random bars. */
export interface RandomEntryConfig extends BaselineConfig {
  /** Fraction of bars to trade on (0-1). Default: 0.1. */
  tradeRate?: number;
  /** Max holding period (bars). Default: 10. */
  maxHolding?: number;
}

/** Simple Momentum: enter when short MA crosses above long MA. */
export interface MomentumConfig extends BaselineConfig {
  /** Short MA period. Default: 10. */
  shortPeriod?: number;
  /** Long MA period. Default: 30. */
  longPeriod?: number;
  /** Max holding period (bars). Default: 20. */
  maxHolding?: number;
}

/** Simple Mean Reversion: enter when price is far below mean. */
export interface MeanReversionConfig extends BaselineConfig {
  /** MA period for mean. Default: 20. */
  period?: number;
  /** Entry threshold (standard deviations below mean). Default: 1.5. */
  entryThreshold?: number;
  /** Exit threshold (standard deviations above mean). Default: 0.5. */
  exitThreshold?: number;
  /** Max holding period (bars). Default: 20. */
  maxHolding?: number;
}
