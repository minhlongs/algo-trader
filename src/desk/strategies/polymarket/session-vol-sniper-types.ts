/**
 * Session Volatility Sniper Strategy Types and Configuration
 */

import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

export interface SessionVolSniperConfig extends BaseStrategyConfig {
  /** Window (ticks) for short-horizon ATR */
  shortAtrWindow: number;
  /** Window (ticks) for rolling average ATR */
  longAtrWindow: number;
  /** Spike detection multiplier (x rollingAvgATR) */
  spikeMultiplier: number;
  /** Minimum number of ticks before entry */
  minTicks: number;
  /** Session duration in ms (time-stop) */
  sessionDurationMs: number;
}

export const DEFAULT_CONFIG: SessionVolSniperConfig = {
  shortAtrWindow: 5,
  longAtrWindow: 20,
  spikeMultiplier: 2.0,
  minTicks: 21, // longAtrWindow + 1 price points for first ATR
  sessionDurationMs: 6 * 60 * 60 * 1000, // 6-hour session
  minVolume: 0,
  takeProfitPct: 0.04,
  stopLossPct: 0.02,
  maxHoldMs: 6 * 60 * 60 * 1000,
  maxPositions: 3,
  cooldownMs: 180_000,
  positionSize: '20',
};

export const STRATEGY_NAME: StrategyName = 'session-vol-sniper';
