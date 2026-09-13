/**
 * Types and configuration for Cross-Correlation Lag V2 Strategy.
 */

import type { StrategyName } from '../../core/types';
import type {
  BaseStrategyConfig,
  StrategyDeps,
} from './base-polymarket-strategy';

export interface CrossCorrelationLagConfig extends BaseStrategyConfig {
  maxLag: number;
  minCorrelation: number;
  predictionThreshold: number;
  priceWindow: number;
  minMarketsPerEvent: number;
}

export const DEFAULT_CONFIG: CrossCorrelationLagConfig = {
  maxLag: 5,
  minCorrelation: 0.6,
  predictionThreshold: 0.02,
  priceWindow: 20,
  minMarketsPerEvent: 2,
  minVolume: 5000,
  takeProfitPct: 0.025,
  stopLossPct: 0.02,
  maxHoldMs: 15 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '10',
};

export const STRATEGY_NAME = 'cross-correlation-lag' as StrategyName;

export interface CrossCorrelationLagDeps extends StrategyDeps {
  config?: Partial<CrossCorrelationLagConfig>;
}
