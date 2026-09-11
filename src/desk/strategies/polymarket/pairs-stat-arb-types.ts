import type { StrategyName } from '../../core/types';
import type { BaseStrategyConfig } from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface PairsStatArbConfig extends BaseStrategyConfig {
  /** Rolling window for spread mean/std computation */
  windowSize: number;
  /** Bollinger band width in standard deviations */
  bandWidth: number;
  /** Minimum spread Z-score to trigger entry */
  entryZScore: number;
  /** Maximum spread Z-score — beyond this is regime change, not mean reversion */
  maxZScore: number;
  /** Minimum correlation between pair members to qualify */
  minCorrelation: number;
  /** Minimum market volume */
  minVolume: number;
  /** Base position size per leg */
  baseSizeUsdc: number;
  /** Number of events to scan */
  scanLimit: number;
}

export const DEFAULT_CONFIG: PairsStatArbConfig = {
  windowSize: 20,
  bandWidth: 2.0,
  entryZScore: 2.0,
  maxZScore: 4.0,
  minCorrelation: 0.6,
  minVolume: 500,
  baseSizeUsdc: 20,
  scanLimit: 5,
  takeProfitPct: 0.03,
  stopLossPct: 0.02,
  maxHoldMs: 8 * 60_000,
  maxPositions: 2,
  cooldownMs: 120_000,
  positionSize: '20',
};

export const STRATEGY_NAME: StrategyName = 'pairs-stat-arb';
