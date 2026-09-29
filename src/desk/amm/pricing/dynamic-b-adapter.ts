/**
 * Dynamic b Liquidity Adapter
 * Adapts LMSR liquidity parameter b based on pool volume & collateral depth,
 * scaling outcome liabilities proportionally to preserve spot prices identically:
 * q_i' = q_i * (b' / b).
 */

import { logger } from '../../../shared/utils/logger';
import { DynamicBAdjustmentResult, DynamicBParams } from '../types/lmsr-types';
import { LmsrPricing } from './lmsr-pricing';

export class DynamicBAdapter {
  /**
   * Compute adapted b based on 24h volume and collateral headroom
   */
  public static computeTargetB(params: DynamicBParams): number {
    const { currentB, availableCollateralUsdc, rolling24hVolumeUsdc, config } = params;
    const n = params.currentLiabilities.length;
    if (n === 0) return currentB;

    const volRatio = config.volumeTargetUsd > 0
      ? Math.max(0, rolling24hVolumeUsdc / config.volumeTargetUsd)
      : 0;
    const volScaledB = config.baseB * (1 + config.volumeSensitivity * Math.pow(volRatio, config.beta));

    // Bounded by available collateral: WCL = b * ln(n) <= availableCollateral
    const maxCollateralB = availableCollateralUsdc > 0 && n > 1
      ? availableCollateralUsdc / Math.log(n)
      : config.maxB;

    const targetB = Math.min(volScaledB, maxCollateralB);
    const clampedB = Math.max(config.minB, Math.min(config.maxB, targetB));
    return clampedB;
  }

  /**
   * Adjust b with price-invariant proportional liability scaling
   */
  public static adjustB(params: DynamicBParams): DynamicBAdjustmentResult {
    const { currentB, currentLiabilities } = params;
    const newB = this.computeTargetB(params);
    const scalingFactor = newB / currentB;

    const spotPricesBefore = LmsrPricing.calculateSpotPrices(currentLiabilities, currentB);
    const scaledLiabilities = currentLiabilities.map((q) => q * scalingFactor);
    const spotPricesAfter = LmsrPricing.calculateSpotPrices(scaledLiabilities, newB);

    // Exact collateral delta: C'(q') - C(q) = (newB - currentB) * (C(q) / currentB)
    const costBefore = LmsrPricing.calculateCost(currentLiabilities, currentB);
    const costAfter = LmsrPricing.calculateCost(scaledLiabilities, newB);
    const collateralDeltaUsdc = costAfter - costBefore;

    logger.debug('[DynamicBAdapter] Adjusted liquidity parameter b', {
      previousB: currentB,
      newB,
      scalingFactor,
      collateralDeltaUsdc,
    });

    return {
      previousB: currentB,
      newB,
      scalingFactor,
      collateralDeltaUsdc,
      previousLiabilities: [...currentLiabilities],
      scaledLiabilities,
      spotPricesBefore,
      spotPricesAfter,
    };
  }

  /**
   * Verify that spot prices remain invariant under scaling
   */
  public static verifyPriceInvariance(
    pricesBefore: number[],
    pricesAfter: number[],
    tolerance: number = 1e-12
  ): boolean {
    if (pricesBefore.length !== pricesAfter.length) return false;
    for (let i = 0; i < pricesBefore.length; i++) {
      if (Math.abs(pricesBefore[i] - pricesAfter[i]) > tolerance) {
        return false;
      }
    }
    return true;
  }
}
