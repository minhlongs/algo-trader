/**
 * Bilateral CVA & DVA Valuation Adjustment Engine
 * Integrates discounted exposure over marginal counterparty and bank default probability distributions.
 *
 * @module desk/xva/cva-dva-engine
 */

import {
  CvaDvaParameters,
  CvaDvaResult,
  HazardRatePoint,
} from './xva-types';

export class CvaDvaEngine {
  /**
   * Calculates unilateral CVA and DVA using discretized trapezoidal integration.
   */
  public computeCvaDva(params: CvaDvaParameters): CvaDvaResult {
    const {
      exposureProfile,
      counterpartyRecoveryRate,
      bankRecoveryRate,
      counterpartyHazardRates,
      bankHazardRates,
    } = params;

    if (exposureProfile.length === 0) {
      throw new Error('Exposure profile must contain at least one observation point');
    }

    if (counterpartyRecoveryRate < 0 || counterpartyRecoveryRate > 1 || bankRecoveryRate < 0 || bankRecoveryRate > 1) {
      throw new Error('Recovery rates must be between 0.0 and 1.0');
    }

    let cva = 0;
    let dva = 0;
    let prevT = 0;
    let prevCptySurv = 1.0;
    let prevBankSurv = 1.0;

    for (let i = 0; i < exposureProfile.length; i++) {
      const point = exposureProfile[i]!;
      const t = point.timeYears;
      const dt = t - prevT;
      if (dt <= 0) continue;

      const cptyLambda = this.interpolateHazardRate(counterpartyHazardRates, t);
      const bankLambda = this.interpolateHazardRate(bankHazardRates, t);

      // Survival probabilities S(t) = exp(-lambda * t)
      const cptySurv = Math.exp(-cptyLambda * t);
      const bankSurv = Math.exp(-bankLambda * t);

      // Marginal default probability dPD = S(prev) - S(cur)
      const dPdCpty = Math.max(0, prevCptySurv - cptySurv);
      const dPdBank = Math.max(0, prevBankSurv - bankSurv);

      // Discounted expected exposure
      const discountedEe = point.expectedExposureUsd * point.discountFactor;
      const discountedEne = Math.abs(point.expectedNegativeExposureUsd) * point.discountFactor;

      cva += (1.0 - counterpartyRecoveryRate) * discountedEe * dPdCpty;
      dva += (1.0 - bankRecoveryRate) * discountedEne * dPdBank;

      prevT = t;
      prevCptySurv = cptySurv;
      prevBankSurv = bankSurv;
    }

    const netAdjustment = dva - cva;
    const totalDefaultProb = Number(((1.0 - prevCptySurv) * 100).toFixed(4));

    return {
      cvaUsd: Number(cva.toFixed(2)),
      dvaUsd: Number(dva.toFixed(2)),
      netBilateralCreditAdjustmentUsd: Number(netAdjustment.toFixed(2)),
      totalDefaultProbabilityPct: totalDefaultProb,
    };
  }

  private interpolateHazardRate(curve: HazardRatePoint[], t: number): number {
    if (curve.length === 0) return 0.02; // default 2% hazard rate (200 bps)
    if (t <= curve[0]!.timeYears) return curve[0]!.hazardRate;
    if (t >= curve[curve.length - 1]!.timeYears) return curve[curve.length - 1]!.hazardRate;

    for (let i = 0; i < curve.length - 1; i++) {
      const p1 = curve[i]!;
      const p2 = curve[i + 1]!;
      if (t >= p1.timeYears && t <= p2.timeYears) {
        const ratio = (t - p1.timeYears) / (p2.timeYears - p1.timeYears);
        return p1.hazardRate + ratio * (p2.hazardRate - p1.hazardRate);
      }
    }
    return curve[0]!.hazardRate;
  }
}
