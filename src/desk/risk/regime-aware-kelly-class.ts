/**
 * Regime-Aware Kelly Position Sizer Class
 */

import { KellyPositionSizer, type KellySizingInput, type KellySizingResult } from './kelly-position-sizer';
import { logger } from '../utils/logger';
import type { MarketRegime } from '../../alpha-lab/regimes/regime-types';
import { DEFAULT_MULTIPLIERS, type RegimeAwareKellyConfig } from './regime-aware-kelly-types';

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
    if (config.unknownRegimeMultiplier !== undefined) {
      this.multipliers.UNKNOWN = config.unknownRegimeMultiplier;
    }
    this.unknownFallback = this.multipliers.UNKNOWN;
  }

  /**
   * Size a position with regime-aware Kelly fraction.
   */
  size(input: KellySizingInput, regime: MarketRegime): KellySizingResult {
    const multiplier = this.multipliers[regime] ?? this.unknownFallback;

    const baseResult = this.inner.calculatePositionSize(input);

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
      portfolioPercent: input.portfolioValue > 0 ? (scaledSize / input.portfolioValue) * 100 : 0,
      kellyAdjusted: baseResult.kellyAdjusted * multiplier,
      fractionUsed: regimeAdjustedFraction,
    };
  }

  /** Expose inner sizer for pipeline compatibility */
  getInner(): KellyPositionSizer {
    return this.inner;
  }
}
