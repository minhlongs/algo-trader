/**
 * Correlation Breakdown Strategy — Types and configuration.
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface CorrelationBreakdownConfig extends BaseStrategyConfig {
  /** Rolling window for correlation computation (number of ticks) */
  windowSize: number;
  /** Z-score threshold for correlation breakdown signal */
  zScoreThreshold: number;
  /** Minimum correlation to consider a pair "historically correlated" */
  minCorrelation: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size */
  baseSizeUsdc: number;
  /** Number of events to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: CorrelationBreakdownConfig = {
  windowSize: 20,
  zScoreThreshold: 2.5,
  minCorrelation: 0.7,
  minVolume: 1000,
  baseSizeUsdc: 25,
  scanLimit: 5,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 2,
  cooldownMs: 120_000,
  positionSize: '25',
};

export const STRATEGY_NAME: StrategyName = 'correlation-breakdown';
