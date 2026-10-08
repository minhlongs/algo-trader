import { FxOptionPriceResult, FxOptionPricingTerms, FxVolSmileDecomposition } from './gk-types';

export class GarmanKohlhagenEngine {
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

  public priceFxOption(terms: FxOptionPricingTerms): FxOptionPriceResult {
    const { spotRate: S, strikeRate: K, timeToExpiryYears: T, domesticRiskFreeRatePct, foreignRiskFreeRatePct, volatilityPct } = terms;

    if (S <= 0 || K <= 0 || T <= 0) throw new Error('Prices and maturity must be positive');
    if (volatilityPct <= 0) throw new Error('Volatility must be positive');

    const rd = domesticRiskFreeRatePct / 100.0;
    const rf = foreignRiskFreeRatePct / 100.0;
    const sigma = volatilityPct / 100.0;
    const sqrtT = Math.sqrt(T);

    const forwardRate = S * Math.exp((rd - rf) * T);
    const d1 = (Math.log(S / K) + (rd - rf + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    const callPrice = S * Math.exp(-rf * T) * this.normalCdf(d1) - K * Math.exp(-rd * T) * this.normalCdf(d2);
    const putPrice = K * Math.exp(-rd * T) * this.normalCdf(-d2) - S * Math.exp(-rf * T) * this.normalCdf(-d1);

    const callDelta = Math.exp(-rf * T) * this.normalCdf(d1);
    const putDelta = -Math.exp(-rf * T) * this.normalCdf(-d1);
    const vega = S * Math.exp(-rf * T) * sqrtT * (Math.exp(-0.5 * d1 * d1) / Math.sqrt(2.0 * Math.PI));

    return {
      callPriceDomestic: Number(callPrice.toFixed(4)),
      putPriceDomestic: Number(putPrice.toFixed(4)),
      spotDeltaCall: Number(callDelta.toFixed(4)),
      spotDeltaPut: Number(putDelta.toFixed(4)),
      forwardRate: Number(forwardRate.toFixed(4)),
      dualVega: Number(vega.toFixed(4)),
    };
  }

  public decomposeSmile(atmVolPct: number, rr25Pct: number, bf25Pct: number): FxVolSmileDecomposition {
    // Standard FX market convention:
    // RR25 = Vol(25D Call) - Vol(25D Put)
    // BF25 = 0.5 * (Vol(25D Call) + Vol(25D Put)) - ATM Vol
    // => Vol(25D Call) = ATM + BF25 + 0.5 * RR25
    // => Vol(25D Put) = ATM + BF25 - 0.5 * RR25
    const call25Vol = atmVolPct + bf25Pct + 0.5 * rr25Pct;
    const put25Vol = atmVolPct + bf25Pct - 0.5 * rr25Pct;

    return {
      atmVolPct,
      riskReversal25DeltaPct: rr25Pct,
      butterfly25DeltaPct: bf25Pct,
      call25DeltaVolPct: Number(call25Vol.toFixed(4)),
      put25DeltaVolPct: Number(put25Vol.toFixed(4)),
    };
  }
}
