import { BondPricingTerms, ConvexityResult } from './convexity-types';

export class BondConvexityEngine {
  public priceBond(terms: BondPricingTerms, yieldOverridePct?: number): number {
    const yPct = yieldOverridePct !== undefined ? yieldOverridePct : terms.yieldPct;
    const m = terms.couponFrequencyPerYear;
    if (m <= 0) throw new Error('couponFrequencyPerYear must be positive');
    if (terms.maturityYears <= 0) throw new Error('maturityYears must be positive');

    const totalPeriods = Math.round(terms.maturityYears * m);
    const periodicRate = (yPct / 100.0) / m;
    const couponPerPeriod = (terms.parValueUsd * (terms.couponRatePct / 100.0)) / m;

    let pv = 0;
    for (let t = 1; t <= totalPeriods; t++) {
      pv += couponPerPeriod / Math.pow(1.0 + periodicRate, t);
    }
    pv += terms.parValueUsd / Math.pow(1.0 + periodicRate, totalPeriods);

    return pv;
  }

  public analyzeConvexity(terms: BondPricingTerms, shiftBps = 10.0): ConvexityResult {
    if (Math.abs(shiftBps) < 1e-4) {
      throw new Error('shiftBps must be non-zero (at least 0.0001)');
    }

    const p0 = this.priceBond(terms);
    const dy = (shiftBps / 10000.0);

    const pUp = this.priceBond(terms, terms.yieldPct + (shiftBps / 100.0));
    const pDown = this.priceBond(terms, terms.yieldPct - (shiftBps / 100.0));

    // Modified duration via central difference: -(P_up - P_down) / (2 * P_0 * dy)
    const modDuration = -(pUp - pDown) / (2.0 * p0 * dy);

    // Effective convexity: (P_up + P_down - 2 * P_0) / (P_0 * dy^2)
    const convexity = (pUp + pDown - 2.0 * p0) / (p0 * dy * dy);

    const m = terms.couponFrequencyPerYear;
    const periodicRate = (terms.yieldPct / 100.0) / m;
    const macDuration = modDuration * (1.0 + periodicRate);

    return {
      bondId: terms.bondId,
      presentValueUsd: Number(p0.toFixed(2)),
      modifiedDurationYears: Number(modDuration.toFixed(4)),
      macaulayDurationYears: Number(macDuration.toFixed(4)),
      effectiveConvexity: Number(convexity.toFixed(4)),
      priceChangeEstimatePct: (deltaYieldPct: number) => {
        const dyShift = deltaYieldPct / 100.0;
        // Taylor expansion: dP/P approx -D * dy + 0.5 * C * dy^2
        const pctChange = (-modDuration * dyShift + 0.5 * convexity * dyShift * dyShift) * 100.0;
        return Number(pctChange.toFixed(4));
      },
    };
  }
}
