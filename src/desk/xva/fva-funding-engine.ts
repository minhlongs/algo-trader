/**
 * Funding Valuation Adjustment (FVA) Engine
 * Calculates FCA (Funding Cost Adjustment) and FBA (Funding Benefit Adjustment) across portfolio lifecycles.
 *
 * @module desk/xva/fva-funding-engine
 */

import {
  FvaParameters,
  FvaResult,
} from './xva-types';

export class FvaFundingEngine {
  /**
   * Computes funding costs and benefits over uncollateralized portfolio profiles.
   */
  public computeFva(params: FvaParameters): FvaResult {
    const {
      exposureProfile,
      fundingBorrowSpreadBps,
      fundingLendingSpreadBps,
    } = params;

    if (exposureProfile.length === 0) {
      throw new Error('Exposure profile must contain at least one point');
    }

    const borrowSpread = fundingBorrowSpreadBps / 10_000; // bps to decimal
    const lendingSpread = fundingLendingSpreadBps / 10_000;

    let fca = 0;
    let fba = 0;
    let prevT = 0;

    for (const point of exposureProfile) {
      const dt = point.timeYears - prevT;
      if (dt <= 0) continue;

      // FCA: Cost of funding uncollateralized positive exposure
      const discEpe = point.expectedExposureUsd * point.discountFactor;
      fca += discEpe * borrowSpread * dt;

      // FBA: Benefit of surplus cash from negative exposure
      const discEne = Math.abs(point.expectedNegativeExposureUsd) * point.discountFactor;
      fba += discEne * lendingSpread * dt;

      prevT = point.timeYears;
    }

    const netFva = fca - fba;

    return {
      fcaUsd: Number(fca.toFixed(2)),
      fbaUsd: Number(fba.toFixed(2)),
      netFvaUsd: Number(netFva.toFixed(2)),
    };
  }
}
