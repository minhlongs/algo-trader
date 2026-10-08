import { HullWhiteParams, JamshidianOptionResult } from './hull-white-types';
import { HullWhiteZeroBondEngine } from './hull-white-zero-bond-engine';

export class JamshidianSwaptionPricer {
  private readonly bondEngine = new HullWhiteZeroBondEngine();

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

  public priceEuropeanSwaption(
    params: HullWhiteParams,
    strikeYieldPct: number,
    optionExpiryYears: number,
    swapTenorYears: number,
    isCallPayer: boolean
  ): JamshidianOptionResult {
    const K = strikeYieldPct / 100.0;
    const { meanReversionA: a, shortRateVolSigma: sigma } = params;

    const rStar = K;
    const t = optionExpiryYears;
    const T = t + swapTenorYears;

    const B_t_T = this.bondEngine.computeBFactor(a, t, T);
    const sigmaP = (sigma / a) * (1.0 - Math.exp(-a * (T - t))) * Math.sqrt((1.0 - Math.exp(-2.0 * a * t)) / (2.0 * a));

    const bondP0T = this.bondEngine.priceZeroCouponBond(params, T).discountFactorP;
    const bondP0t = this.bondEngine.priceZeroCouponBond(params, t).discountFactorP;

    const strikeBondK = 1.0 / (1.0 + K * swapTenorYears);
    const safeSigmaP = Math.max(1e-6, sigmaP);
    const d1 = (Math.log(bondP0T / (strikeBondK * bondP0t)) + 0.5 * safeSigmaP * safeSigmaP) / safeSigmaP;
    const d2 = d1 - safeSigmaP;

    let price = 0;
    if (isCallPayer) {
      price = bondP0T * this.normalCdf(d1) - strikeBondK * bondP0t * this.normalCdf(d2);
    } else {
      price = strikeBondK * bondP0t * this.normalCdf(-d2) - bondP0T * this.normalCdf(-d1);
    }

    const swaptionPriceBps = Number((Math.max(0, price) * 10000.0).toFixed(2));

    return {
      strikeYieldPct,
      swaptionTenorYears: swapTenorYears,
      swaptionPriceBps,
      isCallPayer,
      criticalShortRateRStar: Number(rStar.toFixed(6)),
    };
  }
}
