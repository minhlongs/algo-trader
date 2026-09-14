import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface FundingRateArbConfig extends BaseStrategyConfig {
  /** Rolling window for funding rate statistics */
  windowSize: number;
  /** Percentile threshold to signal extreme funding (0-1, e.g. 0.9 = top 10%) */
  extremePercentile: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Number of markets to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: FundingRateArbConfig = {
  windowSize: 24,
  extremePercentile: 0.9,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 15,
  takeProfitPct: 0.025,
  stopLossPct: 0.015,
  maxHoldMs: 6 * 60_000,
  maxPositions: 2,
  cooldownMs: 90_000,
  positionSize: '25',
};

export const STRATEGY_NAME: StrategyName = 'funding-rate-arb';
