import type { BaseStrategyConfig } from './base-polymarket-strategy';
import type { StrategyName } from '../../core/types';

export interface GammaScalpingConfig extends BaseStrategyConfig {
  volWindow: number;
  gammaThreshold: number;
  minVolume: number;
  baseSizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: GammaScalpingConfig = {
  volWindow: 20,
  gammaThreshold: 2.0,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 3 * 60_000,
  maxPositions: 3,
  cooldownMs: 30_000,
  positionSize: '25',
};

export const STRATEGY_NAME: StrategyName = 'gamma-scalping';
