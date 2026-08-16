/**
 * Regime-Aware Kelly Position Sizer
 *
 * Wraps KellyPositionSizer with regime-based fraction multipliers.
 * Reduces exposure in unfavorable regimes (SHOCK, TREND_DOWN, HIGH_VOL)
 * and increases in favorable regimes (TREND_UP, LOW_VOL, RANGE).
 *
 * Fraction multipliers per regime (configurable via env):
 *   TREND_UP      → 1.25x  (momentum strategies perform well)
 *   TREND_DOWN    → 0.50x  (reduce exposure)
 *   RANGE         → 1.00x  (baseline)
 *   HIGH_VOLATILITY → 0.50x (risk-off)
 *   LOW_VOLATILITY → 1.10x (opportunity)
 *   SHOCK         → 0.00x  (flat — no new positions)
 *   UNKNOWN       → 0.75x  (conservative default)
 */

import { KellyPositionSizer, type KellyConfig, type KellySizingInput, type KellySizingResult } from './kelly-position-sizer';
import { logger } from '../utils/logger';
import type { MarketRegime } from '../../alpha-lab/regimes/regime-types';

export interface RegimeAwareKellyConfig {
  /** Base Kelly config passed to inner sizer */
  kelly: Partial<KellyConfig>;
  /** Fraction multiplier per regime (defaults listed in header) */
  regimeMultipliers: Partial<Record<MarketRegime, number>>;
  /** Fallback multiplier when regime is UNKNOWN or not in map */
  unknownRegimeMultiplier: number;
}

const DEFAULT_MULTIPLIERS: Record<MarketRegime, number> = {
  TREND_UP: 1.25,
  TREND_DOWN: 0.50,
  RANGE: 1.00,
  HIGH_VOLATILITY: 0.50,
  LOW_VOLATILITY: 1.10,
  SHOCK: 0.00,
  UNKNOWN: 0.75,
};

export class RegimeAwareKelly {
  private inner: KellyPositionSizer;
  private multipliers: Record<MarketRegime, number>;
  private unknownFallback: number;

  constructor(config: RegimeAwareKellyConfig) {
    this.inner = new KellyPositionSizer({
      kellyFraction: config.kelly.kellyFraction ?? 0.25,
      maxPositionFraction: config.kelly.maxPositionFraction ?? 0.05,
      minPositionUsd: config.kelly.minPositionUsd ?? 1.0,
      isManagedCapital: config.kelly.isManagedCapital ?? true,
    });
    this.multipliers = { ...DEFAULT_MULTIPLIERS, ...(config.regimeMultipliers ?? {}) };
    // Allow unknownRegimeMultiplier to override the UNKNOWN entry in multipliers
    if (config.unknownRegimeMultiplier !== undefined) {
      this.multipliers.UNKNOWN = config.unknownRegimeMultiplier;
    }
    this.unknownFallback = this.multipliers.UNKNOWN;
  }

  /**
   * Size a position with regime-aware Kelly fraction.
   *
   * @param input — base Kelly sizing inputs
   * @param regime — current market regime (from RegimeEngine)
   * @returns KellySizingResult with regime-adjusted fraction
   */
  size(input: KellySizingInput, regime: MarketRegime): KellySizingResult {
    const multiplier = this.multipliers[regime] ?? this.unknownFallback;

    // Call inner sizer with the base input to get raw Kelly result
    const baseResult = this.inner.calculatePositionSize(input);

    // Scale position by regime multiplier (SHOCK → 0, TREND_UP → 1.25x, etc.)
    const regimeAdjustedFraction = baseResult.fractionUsed * multiplier;
    const scaledSize = baseResult.positionSizeUsd * multiplier;

    logger.info(
      `[RegimeAwareKelly] regime=${regime} multiplier=${multiplier.toFixed(2)} ` +
        `baseFraction=${baseResult.fractionUsed.toFixed(4)} adjustedFraction=${regimeAdjustedFraction.toFixed(4)} ` +
        `size=$${scaledSize.toFixed(2)}`,
    );

    return {
      ...baseResult,
      positionSizeUsd: scaledSize,
      kellyAdjusted: baseResult.kellyAdjusted * multiplier,
      fractionUsed: regimeAdjustedFraction,
    };
  }

  /** Expose inner sizer for pipeline compatibility */
  getInner(): KellyPositionSizer {
    return this.inner;
  }
}