/**
 * VWAP Deviation Sniper types and default configuration.
 */

import type { StrategyName } from '../../core/types';
import type {
  BaseStrategyConfig,
  StrategyDeps,
} from './base-polymarket-strategy';

export interface VwapDeviationSniperConfig extends BaseStrategyConfig {
  vwapWindow: number;
  minPeriods: number;
  deviationThreshold: number;
  exitThreshold: number;
}

export const DEFAULT_CONFIG: VwapDeviationSniperConfig = {
  vwapWindow: 20,
  minPeriods: 10,
  deviationThreshold: 2.0,
  exitThreshold: 0.5,
  minVolume: 5000,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 20 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '12',
};

export const STRATEGY_NAME = 'vwap-deviation-sniper' as StrategyName;

export interface VwapDeviationSniperDeps extends StrategyDeps {
  config?: Partial<VwapDeviationSniperConfig>;
}
