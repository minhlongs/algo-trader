/**
 * Relative Strength Rotation Types and Configuration.
 */

import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';

export interface RelativeStrengthRotationConfig extends BaseStrategyConfig {
  lookbackWindow: number;
  minRankSpread: number;
  topNPercent: number;
  momentumEmaAlpha: number;
  minMarketsPerEvent: number;
}

export const DEFAULT_CONFIG: RelativeStrengthRotationConfig = {
  lookbackWindow: 15,
  minRankSpread: 0.03,
  topNPercent: 0.25,
  momentumEmaAlpha: 0.12,
  minMarketsPerEvent: 3,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 25 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

export interface RelativeStrengthRotationDeps extends StrategyDeps {
  config?: Partial<RelativeStrengthRotationConfig>;
}
