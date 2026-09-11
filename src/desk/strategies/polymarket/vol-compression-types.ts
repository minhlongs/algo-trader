/**
 * Vol Compression Breakout Strategy Types and Configuration
 */

import type { StrategyName } from '../../core/types';
import type { KellyPositionSizer } from '../../polymarket/kelly-position-sizer';
import {
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';

export interface VolCompressionConfig extends BaseStrategyConfig {
  shortVolWindow: number;
  longVolWindow: number;
  compressionThreshold: number;
  breakoutMultiplier: number;
  atrPeriod: number;
  sizeUsdc: number;
  scanLimit: number;
}

export const DEFAULT_CONFIG: VolCompressionConfig = {
  shortVolWindow: 10,
  longVolWindow: 40,
  compressionThreshold: 0.4,
  breakoutMultiplier: 2.5,
  atrPeriod: 10,
  sizeUsdc: 30,
  scanLimit: 15,
  minVolume: 0,
  takeProfitPct: 0.035,
  stopLossPct: 0.015,
  maxHoldMs: 12 * 60_000,
  maxPositions: 4,
  cooldownMs: 120_000,
  positionSize: '30',
};

export const STRATEGY_NAME: StrategyName = 'vol-compression-breakout';

export interface CompressionEntry {
  compressed: boolean;
  compressedAt: number;
}

export interface VolCompressionDeps extends StrategyDeps {
  kellySizer?: KellyPositionSizer;
  config?: Partial<VolCompressionConfig>;
}
