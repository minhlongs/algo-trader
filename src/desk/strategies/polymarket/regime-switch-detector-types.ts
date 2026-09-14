import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig, StrategyDeps } from './base-polymarket-strategy';

export interface RegimeSwitchDetectorConfig extends BaseStrategyConfig {
  shortWindow: number;
  longWindow: number;
  vrEmaAlpha: number;
  trendingThreshold: number;
  meanRevertThreshold: number;
}

export const DEFAULT_CONFIG: RegimeSwitchDetectorConfig = {
  shortWindow: 5,
  longWindow: 20,
  vrEmaAlpha: 0.12,
  trendingThreshold: 1.2,
  meanRevertThreshold: 0.8,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

export const STRATEGY_NAME = 'regime-switch-detector' as StrategyName;

export interface RegimeSwitchDetectorDeps extends StrategyDeps {
  config?: Partial<RegimeSwitchDetectorConfig>;
}
