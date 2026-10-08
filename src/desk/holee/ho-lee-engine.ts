import {
  HoLeeBondResult,
  HoLeeModelParameters,
  HoLeeOptionPriceResult,
  HoLeeOptionTerms,
} from './ho-lee-types';
import { NormalDistribution } from './normal-distribution';

export class HoLeeEngine {
  public priceZeroCouponBond(
    params: HoLeeModelParameters,
    maturityTau: number,
    faceValueUsd = 100.0
  ): HoLeeBondResult {
    const { initialShortRateR0: r0, volatilitySigma: sigma, driftTheta: theta } = params;

    if (maturityTau <= 0) throw new Error('Maturity must be positive');
    if (sigma <= 0) throw new Error('Volatility sigma must be strictly positive');
    if (faceValueUsd <= 0) throw new Error('Face value must be positive');

    // ln P(0, T) = -r0 * T - 0.5 * theta * T^2 + (1/6) * sigma^2 * T^3
    const t = maturityTau;
    const sigmaSq = sigma * sigma;
    const lnDiscount = -r0 * t - 0.5 * theta * t * t + (1.0 / 6.0) * sigmaSq * Math.pow(t, 3);
    const discountFactor = Math.exp(lnDiscount);
    const bondPrice = discountFactor * faceValueUsd;
    const yieldRate = (-lnDiscount / t) * 100.0;
    const forwardRate = (r0 + theta * t - 0.5 * sigmaSq * t * t) * 100.0;

    return {
      maturityYears: t,
      bondPriceUsd: Number(bondPrice.toFixed(4)),
      yieldPct: Number(yieldRate.toFixed(4)),
      instantaneousForwardRatePct: Number(forwardRate.toFixed(4)),
      varianceFactor: Number(((1.0 / 6.0) * sigmaSq * Math.pow(t, 3)).toFixed(6)),
    };
  }

  public priceBondOption(
    params: HoLeeModelParameters,
    terms: HoLeeOptionTerms,
    faceValueUsd = 100.0
  ): HoLeeOptionPriceResult {
    const { optionExpiryYears: T, bondMaturityYears: S, strikePriceUsd: K } = terms;
    const { volatilitySigma: sigma } = params;

    if (T <= 0 || S <= T) throw new Error('Option expiry must be positive and less than bond maturity');
    if (K <= 0) throw new Error('Strike price must be positive');

    const pT = this.priceZeroCouponBond(params, T, faceValueUsd).bondPriceUsd / faceValueUsd;
    const pS = this.priceZeroCouponBond(params, S, faceValueUsd).bondPriceUsd / faceValueUsd;

    // sigma_P = sigma * (S - T) * sqrt(T)
    const sigmaP = sigma * (S - T) * Math.sqrt(T);
    const forwardBond = (pS / pT) * faceValueUsd;

    // d1 = (ln(pS / (K/faceValue * pT))) / sigmaP + 0.5 * sigmaP
    const strikeDiscounted = (K / faceValueUsd) * pT;
    const d1 = Math.log(pS / strikeDiscounted) / sigmaP + 0.5 * sigmaP;
    const d2 = d1 - sigmaP;

    const callPrice = faceValueUsd * (pS * NormalDistribution.cdf(d1) - (K / faceValueUsd) * pT * NormalDistribution.cdf(d2));
    const putPrice = faceValueUsd * ((K / faceValueUsd) * pT * NormalDistribution.cdf(-d2) - pS * NormalDistribution.cdf(-d1));

    return {
      callPriceUsd: Number(Math.max(0, callPrice).toFixed(4)),
      putPriceUsd: Number(Math.max(0, putPrice).toFixed(4)),
      forwardBondPriceUsd: Number(forwardBond.toFixed(4)),
      volatilitySigmaP: Number(sigmaP.toFixed(6)),
      d1: Number(d1.toFixed(4)),
      d2: Number(d2.toFixed(4)),
    };
  }
}
