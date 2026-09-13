/**
 * Momentum Cascade V2 — Types & Config
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';

export interface MomentumCascadeConfig extends BaseStrategyConfig {
  momentumWindow: number;
  momentumEmaAlpha: number;
  cascadeThreshold: number;
  followerLagMax: number;
  minMarketsPerEvent: number;
}

export const DEFAULT_CONFIG: MomentumCascadeConfig = {
  momentumWindow: 12,
  momentumEmaAlpha: 0.15,
  cascadeThreshold: 0.03,
  followerLagMax: 0.01,
  minMarketsPerEvent: 2,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

export const STRATEGY_NAME = 'momentum-cascade' as StrategyName;

export interface MomentumCascadeDeps extends StrategyDeps {
  config?: Partial<MomentumCascadeConfig>;
}
