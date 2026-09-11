/**
 * Cross-Event Drift Strategy Types & Config
 */

import type { StrategyName } from '../../core/types';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';

export interface CrossEventDriftConfig extends BaseStrategyConfig {
  driftThreshold: number;
  followThreshold: number;
  minCorrelation: number;
  lookbackPeriods: number;
  returnWindow: number;
  sizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: CrossEventDriftConfig = {
  driftThreshold: 0.03,
  followThreshold: 0.005,
  minCorrelation: 0.3,
  lookbackPeriods: 15,
  returnWindow: 5,
  sizeUsdc: 25,
  scanLimit: 8,
  minVolume: 0,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 10 * 60_000,
  maxPositions: 5,
  cooldownMs: 90_000,
  positionSize: '25',
};

export const STRATEGY_NAME: StrategyName = 'cross-event-drift';

export interface CrossEventDriftDeps extends StrategyDeps {
  kellySizer?: KellyPositionSizer;
  config?: Partial<CrossEventDriftConfig>;
}
