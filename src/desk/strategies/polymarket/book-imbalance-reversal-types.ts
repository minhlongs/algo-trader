import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface BookImbalanceConfig extends BaseStrategyConfig {
  /** Number of orderbook levels to sum */
  depthLevels: number;
  /** Z-score threshold for entry */
  zScoreThreshold: number;
  /** Z-score threshold for exit (mean-reversion detected) */
  exitZScore: number;
  /** Rolling window (ticks) for mean/std calculation */
  lookbackWindow: number;
  /** Minimum ticks before entry */
  minTicks: number;
}

export const DEFAULT_CONFIG: BookImbalanceConfig = {
  depthLevels: 10,
  zScoreThreshold: 2.0,
  exitZScore: 0.5,
  lookbackWindow: 20,
  minTicks: 10,
  minVolume: 1000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '20',
};

export const STRATEGY_NAME: StrategyName = 'book-imbalance-reversal';
