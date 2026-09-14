/**
 * Resolution Frontrunner Strategy Types and Configuration.
 */

import type { StrategyName } from '../../core/types';
import type {
  BaseStrategyConfig,
  StrategyDeps,
} from './base-polymarket-strategy';

export interface ResolutionFrontrunnerConfig extends BaseStrategyConfig {
  resolutionWindowMs: number;
  highThreshold: number;
  lowThreshold: number;
  momentumTicks: number;
  minVolume24h: number;
}

export const DEFAULT_CONFIG: ResolutionFrontrunnerConfig = {
  resolutionWindowMs: 86_400_000,
  highThreshold: 0.85,
  lowThreshold: 0.15,
  momentumTicks: 5,
  minVolume24h: 10_000,
  minVolume: 0,
  takeProfitPct: 0.03,
  stopLossPct: 0.05,
  maxHoldMs: 14_400_000,
  maxPositions: 3,
  cooldownMs: 300_000,
  positionSize: '20',
};

export const STRATEGY_NAME = 'resolution-frontrunner' as StrategyName;

export interface ResolutionFrontrunnerDeps extends StrategyDeps {
  config?: Partial<ResolutionFrontrunnerConfig>;
  clock?: () => number;
}
