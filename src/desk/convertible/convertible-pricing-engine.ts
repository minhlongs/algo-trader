import { ConvertibleTerms, EquityState, ConvertibleValuation } from './convertible-types';

export class ConvertiblePricingEngine {
  private normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const erf = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * erf);
  }

  private normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public valueConvertible(terms: ConvertibleTerms, equity: EquityState): ConvertibleValuation {
    const { parValueUsd, couponRatePct, maturityYears, conversionRatio, creditSpreadBps, riskFreeRatePct } = terms;
    const { stockPriceUsd, annualizedVolatilityPct, dividendYieldPct } = equity;

    const discountRate = (riskFreeRatePct + creditSpreadBps / 100.0) / 100.0;
    const annualCouponUsd = parValueUsd * (couponRatePct / 100.0);

    let bondFloor = 0;
    for (let t = 1; t <= maturityYears; t++) {
      bondFloor += annualCouponUsd / Math.pow(1 + discountRate, t);
    }
    bondFloor += parValueUsd / Math.pow(1 + discountRate, maturityYears);

    const conversionValue = stockPriceUsd * conversionRatio;
    const effectiveStrike = parValueUsd / conversionRatio;
    const vol = annualizedVolatilityPct / 100.0;
    const r = riskFreeRatePct / 100.0;
    const q = dividendYieldPct / 100.0;
    const T = Math.max(0.01, maturityYears);

    const d1 = (Math.log(stockPriceUsd / effectiveStrike) + (r - q + 0.5 * vol * vol) * T) / (vol * Math.sqrt(T));
    const d2 = d1 - vol * Math.sqrt(T);

    const callOptionPerShare = stockPriceUsd * Math.exp(-q * T) * this.normalCdf(d1) - effectiveStrike * Math.exp(-r * T) * this.normalCdf(d2);
    const embeddedOptionValue = callOptionPerShare * conversionRatio;

    const theoreticalPrice = Math.max(bondFloor, conversionValue) + embeddedOptionValue * 0.75;
    const delta = conversionRatio * this.normalCdf(d1);
    const gamma = (conversionRatio * this.normalPdf(d1)) / (stockPriceUsd * vol * Math.sqrt(T));
    const conversionPremiumPct = ((theoreticalPrice - conversionValue) / conversionValue) * 100.0;

    return {
      conversionValueUsd: Number(conversionValue.toFixed(2)),
      bondFloorUsd: Number(bondFloor.toFixed(2)),
      theoreticalPriceUsd: Number(theoreticalPrice.toFixed(2)),
      conversionPremiumPct: Number(conversionPremiumPct.toFixed(2)),
      delta: Number(delta.toFixed(4)),
      gamma: Number(gamma.toFixed(6)),
    };
  }
}
