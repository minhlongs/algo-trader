import type { KellyConfig } from './kelly-position-sizer';
import type { MarketRegime } from '../../alpha-lab/regimes/regime-types';
import type { TieredDrawdownBreaker } from './tiered-drawdown-breaker';
import type { RegimeAwareKelly } from './regime-aware-kelly-class';

export interface RegimeAwareKellyConfig {
  /** Base Kelly config passed to inner sizer */
  kelly: Partial<KellyConfig>;
  /** Fraction multiplier per regime (defaults listed in header) */
  regimeMultipliers: Partial<Record<MarketRegime, number>>;
  /** Fallback multiplier when regime is UNKNOWN or not in map */
  unknownRegimeMultiplier: number;
}

export const DEFAULT_MULTIPLIERS: Record<MarketRegime, number> = {
  TREND_UP: 1.25,
  TREND_DOWN: 0.50,
  RANGE: 1.00,
  HIGH_VOLATILITY: 0.50,
  LOW_VOLATILITY: 1.10,
  SHOCK: 0.00,
  UNKNOWN: 0.75,
};

export interface SizeSignalOptions {
  /** Current paper or live portfolio equity in USD */
  portfolioEquity: number;
  /** Current market price of the asset */
  currentPrice: number;
  /** Symbol override if signal.symbol is omitted */
  symbol?: string;
  /** RegimeAwareKelly instance (defaults to Quarter-Kelly, 5% max cap) */
  regimeKelly?: RegimeAwareKelly;
  /** Optional TieredDrawdownBreaker instance */
  drawdownBreaker?: TieredDrawdownBreaker;
  /** Fallback winLossRatio if expectancy is uncalibrated (default: 1.5) */
  defaultWinLossRatio?: number;
  /** Hard-cap post-regime sizing at 5% of portfolio equity (default: true) */
  strictMaxCap?: boolean;
  /** Minimum position size in USD (default: 1.0) */
  minPositionUsd?: number;
}

export type SignalSizingOptions = SizeSignalOptions;
