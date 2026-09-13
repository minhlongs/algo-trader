/**
 * Types and configuration for Liquidation Cascade Strategy.
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface LiquidationCascadeConfig extends BaseStrategyConfig {
  /** Price move threshold (%) to detect a cascade event */
  cascadeMovePct: number;
  /** Volume absorption threshold: fraction of bid/ask depth consumed */
  volumeAbsorptionThreshold: number;
  /** Cooldown after cascade detection (ms) before entering */
  cascadeCooldownMs: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Markets to scan */
  scanLimit: number;
  /** Window (ticks) for price acceleration calculation */
  accelWindow: number;
}

export const DEFAULT_CONFIG: LiquidationCascadeConfig = {
  cascadeMovePct: 0.03,
  volumeAbsorptionThreshold: 0.5,
  cascadeCooldownMs: 30_000,
  minVolume: 1000,
  baseSizeUsdc: 30,
  scanLimit: 15,
  accelWindow: 3,
  takeProfitPct: 0.025,
  stopLossPct: 0.035,
  maxHoldMs: 5 * 60_000,
  maxPositions: 1,
  cooldownMs: 180_000,
  positionSize: '30',
};

export const STRATEGY_NAME: StrategyName = 'liquidation-cascade';
