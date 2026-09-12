/**
 * Orderbook Depth Ratio Types & Configuration
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';

export interface OrderbookDepthConfig extends BaseStrategyConfig {
  depthLevels: number;
  highThreshold: number;
  lowThreshold: number;
  zScoreThreshold: number;
  momentumAlignRequired: boolean;
  lookbackPeriods: number;
  /** Fallback size when kellySizer is unavailable */
  sizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: OrderbookDepthConfig = {
  depthLevels: 5,
  highThreshold: 3.0,
  lowThreshold: 0.33,
  zScoreThreshold: 1.5,
  momentumAlignRequired: true,
  lookbackPeriods: 20,
  sizeUsdc: 30,
  scanLimit: 15,
  minVolume: 0,
  takeProfitPct: 0.025,
  stopLossPct: 0.018,
  maxHoldMs: 8 * 60_000,
  maxPositions: 4,
  cooldownMs: 60_000,
  positionSize: '30',
};

export const STRATEGY_NAME: StrategyName = 'orderbook-depth-ratio';

export interface OrderbookDepthDeps extends StrategyDeps {
  kellySizer?: KellyPositionSizer;
  config?: Partial<OrderbookDepthConfig>;
}
