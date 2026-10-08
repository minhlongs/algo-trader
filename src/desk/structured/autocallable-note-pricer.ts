/**
 * Autocallable Reverse Convertible Structured Note Simulator & Pricer
 * Worst-of multi-asset basket performance tracking with memory coupon accumulation and knock-in barriers.
 *
 * @module desk/structured/autocallable-note-pricer
 */

import {
  BasketAsset,
  AutocallableObservationSchedule,
  AutocallableNoteResult,
} from './structured-types';

export class AutocallableNotePricer {
  /**
   * Evaluates an Autocallable Note across observation periods and terminal payoff.
   *
   * @param basket Assets in the underlying basket
   * @param schedule Observation dates with autocall barriers and coupon rates
   * @param protectionBarrierPct Final protection barrier (e.g. 0.70 for 70% of initial)
   */
  public evaluateAutocallableNote(
    basket: BasketAsset[],
    schedule: AutocallableObservationSchedule[],
    protectionBarrierPct = 0.70
  ): AutocallableNoteResult {
    if (basket.length === 0) {
      throw new Error('Basket must contain at least one asset');
    }
    if (schedule.length === 0) {
      throw new Error('Schedule must contain at least one observation');
    }

    // Determine performance of each asset
    let worstAsset = basket[0]!;
    let worstRatio = worstAsset.currentSpotPrice / worstAsset.initialSpotPrice;

    for (const asset of basket) {
      if (asset.initialSpotPrice <= 0 || asset.currentSpotPrice < 0) {
        throw new Error('Spot prices must be strictly positive');
      }
      const ratio = asset.currentSpotPrice / asset.initialSpotPrice;
      if (ratio < worstRatio) {
        worstRatio = ratio;
        worstAsset = asset;
      }
    }

    // Evaluate observation schedule for early redemption (autocall)
    let isAutocalled = false;
    let autocallTriggerMonth: number | null = null;
    let totalCouponPaidPct = 0;
    let accruedCouponMemory = 0;

    for (const obs of schedule) {
      const couponDue = obs.couponRatePct;
      accruedCouponMemory += couponDue;

      // Autocall condition: worst performing asset >= autocall barrier
      if (worstRatio >= obs.autocallBarrierPct) {
        isAutocalled = true;
        autocallTriggerMonth = obs.observationMonth;
        totalCouponPaidPct += accruedCouponMemory;
        accruedCouponMemory = 0;
        break; // Note redeems early
      } else {
        // If coupon barrier is met (assumed equal to protection barrier for memory coupon)
        if (worstRatio >= protectionBarrierPct) {
          totalCouponPaidPct += accruedCouponMemory;
          accruedCouponMemory = 0;
        }
      }
    }

    let capitalRedemptionPct = 1.0; // 100% principal return if autocalled or protected
    if (!isAutocalled) {
      if (worstRatio < protectionBarrierPct) {
        // Knock-in breach at maturity: Capital losses tied 1:1 to worst performing asset
        capitalRedemptionPct = Number(worstRatio.toFixed(4));
      } else {
        capitalRedemptionPct = 1.0;
      }
    }

    return {
      isAutocalled,
      autocallTriggerMonth,
      totalCouponPaidPct: Number(totalCouponPaidPct.toFixed(4)),
      capitalRedemptionPct: Number(capitalRedemptionPct.toFixed(4)),
      worstPerformingAsset: worstAsset.symbol,
      worstPerformanceRatio: Number(worstRatio.toFixed(4)),
    };
  }
}
