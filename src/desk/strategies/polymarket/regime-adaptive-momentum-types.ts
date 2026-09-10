/**
 * Regime-Adaptive Momentum Types and Config
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';

export interface RegimeAdaptiveMomentumConfig extends BaseStrategyConfig {
  shortWindow: number;
  longWindow: number;
  trendThreshold: number;
  volatileAtrRatio: number;
  trendingPullbackPct: number;
  volatilePullbackPct: number;
  obiEntryThreshold: number;
  baseSizeUsdc: number;
  trendingTpPct: number;
  rangingTpPct: number;
  volatileTpPct: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: RegimeAdaptiveMomentumConfig = {
  shortWindow: 10,
  longWindow: 30,
  trendThreshold: 1.5,
  volatileAtrRatio: 2.0,
  trendingPullbackPct: 0.30,
  volatilePullbackPct: 0.20,
  obiEntryThreshold: 2.0,
  baseSizeUsdc: 25,
  trendingTpPct: 0.05,
  rangingTpPct: 0.03,
  volatileTpPct: 0.025,
  scanLimit: 15,
  minVolume: 0,
  takeProfitPct: 0.025, // lowest regime TP — base class check uses this floor
  stopLossPct: 0.02,
  maxHoldMs: 8 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '25',
};

export const STRATEGY_NAME: StrategyName = 'regime-adaptive-momentum';

export type Regime = 'trending' | 'ranging' | 'volatile';

export interface RegimeAdaptiveMomentumDeps extends StrategyDeps {
  config?: Partial<RegimeAdaptiveMomentumConfig>;
}
