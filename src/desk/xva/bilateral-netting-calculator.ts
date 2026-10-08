/**
 * Bilateral Netting Set & Margin Threshold Calculator
 * ISDA Master Agreement netting rules with Credit Support Annex (CSA) threshold evaluations.
 *
 * @module desk/xva/bilateral-netting-calculator
 */

import {
  NettingSetParameters,
  NettingSetResult,
} from './xva-types';

export class BilateralNettingCalculator {
  /**
   * Evaluates portfolio netting factor and computes required margin calls.
   */
  public evaluateNettingSet(params: NettingSetParameters): NettingSetResult {
    const {
      nettingSetId,
      isdaMasterActive,
      trades,
      postedCollateralUsd,
      thresholdUsd,
      minimumTransferAmountUsd,
    } = params;

    if (trades.length === 0) {
      throw new Error('Trades list cannot be empty');
    }

    let grossPositiveExposure = 0;
    let portfolioMtm = 0;

    for (const trade of trades) {
      portfolioMtm += trade.mtmValueUsd;
      if (trade.mtmValueUsd > 0) {
        grossPositiveExposure += trade.mtmValueUsd;
      }
    }

    // Bilateral netting if ISDA Master Agreement is in effect
    let uncollateralizedExposure = 0;
    if (isdaMasterActive) {
      uncollateralizedExposure = Math.max(0, portfolioMtm);
    } else {
      uncollateralizedExposure = grossPositiveExposure;
    }

    const nettingFactor = grossPositiveExposure > 0
      ? Number((uncollateralizedExposure / grossPositiveExposure).toFixed(4))
      : 1.0;

    // Collateral & Margin Call Calculation:
    // Required Margin = max(0, Exposure - Threshold - Collateral)
    const exposureAboveThreshold = Math.max(0, uncollateralizedExposure - thresholdUsd);
    const unhedgedMargin = Math.max(0, exposureAboveThreshold - postedCollateralUsd);

    let marginCallRequiredUsd = 0;
    if (unhedgedMargin >= minimumTransferAmountUsd) {
      marginCallRequiredUsd = unhedgedMargin;
    }

    return {
      nettingSetId,
      grossPositiveExposureUsd: Number(grossPositiveExposure.toFixed(2)),
      nettedExposureUsd: Number(uncollateralizedExposure.toFixed(2)),
      nettingFactor,
      marginCallRequiredUsd: Number(marginCallRequiredUsd.toFixed(2)),
    };
  }
}
