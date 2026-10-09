import { HoLeeParams, HoLeeBondResult, HoLeeOptionParams, HoLeeOptionResult } from './holee-types.js';
import { HoLeeMath } from './holee-math.js';

export class HoLeeEngine {
  public static validate(params: HoLeeParams): void {
    if (params.rateVolatility <= 0) throw new Error('rateVolatility must be positive');
  }

  /**
   * Ho-Lee (1986) Arbitrage-Free Term Structure Engine
   * Under constant drift parameter theta:
   * dr_t = theta * dt + sigma * dW_t
   * Zero Coupon Bond:
   * P(0, T) = exp(-r(0)*T - 0.5 * theta * T^2 + (1/6) * sigma^2 * T^3)
   */
  public static priceZeroCouponBond(params: HoLeeParams, maturity: number, constantTheta: number = 0.01): HoLeeBondResult {
    this.validate(params);
    if (maturity <= 0) throw new Error('maturity must be positive');
    const { shortRate: r0, rateVolatility: sigma } = params;

    const term1 = -r0 * maturity;
    const term2 = -0.5 * constantTheta * maturity * maturity;
    const term3 = (1.0 / 6.0) * sigma * sigma * Math.pow(maturity, 3);
    const logP = term1 + term2 + term3;
    const zeroBondPrice = Math.exp(logP);
    const zeroYield = -logP / maturity;
    const instantaneousForwardRate = r0 + constantTheta * maturity - 0.5 * sigma * sigma * maturity * maturity;

    return {
      maturity,
      zeroBondPrice: Math.max(0, zeroBondPrice),
      zeroYield,
      instantaneousForwardRate,
    };
  }

  /**
   * European Option on Zero-Coupon Bond under Ho-Lee model:
   * Option expires at t on a bond maturing at T (t < T).
   * Sigma_p = sigma * (T - t) * sqrt(t)
   */
  public static priceBondOption(params: HoLeeOptionParams, constantTheta: number = 0.01): HoLeeOptionResult {
    const { bondMaturity: T, optionExpiry: t, strikePrice: K, shortRate: r0, rateVolatility: sigma, isCall } = params;
    if (t >= T) throw new Error('optionExpiry t must be strictly less than bondMaturity T');
    if (K <= 0) throw new Error('strikePrice must be positive');

    const bondT = this.priceZeroCouponBond({ shortRate: r0, rateVolatility: sigma }, T, constantTheta).zeroBondPrice;
    const bondt = this.priceZeroCouponBond({ shortRate: r0, rateVolatility: sigma }, t, constantTheta).zeroBondPrice;

    const sigmaP = sigma * (T - t) * Math.sqrt(t);
    const d1 = (Math.log(bondT / (bondt * K)) + 0.5 * sigmaP * sigmaP) / sigmaP;
    const d2 = d1 - sigmaP;

    const Nd1 = HoLeeMath.normalCdf(d1);
    const Nd2 = HoLeeMath.normalCdf(d2);
    const nNd1 = HoLeeMath.normalCdf(-d1);
    const nNd2 = HoLeeMath.normalCdf(-d2);

    let optionPrice = 0;
    if (isCall) {
      optionPrice = bondT * Nd1 - bondt * K * Nd2;
    } else {
      optionPrice = bondt * K * nNd2 - bondT * nNd1;
    }

    return {
      optionPrice: Math.max(0, optionPrice),
      bondPriceT: bondT,
      bondPricet: bondt,
      strikePrice: K,
      d1,
      d2,
    };
  }
}
