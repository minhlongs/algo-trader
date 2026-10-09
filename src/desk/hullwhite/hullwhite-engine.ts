/**
 * Hull-White (1990) Analytical Short-Rate Engine
 */

import {
  HullWhiteModelParams,
  ZeroCouponBondParams,
  EuropeanBondOptionParams,
  HullWhiteResult,
  EuropeanBondOptionResult,
} from './hullwhite-types.js';
import { HullWhiteMath } from './hullwhite-math.js';

export class HullWhiteAnalyticalEngine {
  public static validateModel(model: HullWhiteModelParams): void {
    if (model.meanReversion <= 0) throw new Error('meanReversion must be positive');
    if (model.volatility <= 0) throw new Error('volatility must be positive');
  }

  public static priceBond(
    model: HullWhiteModelParams,
    params: ZeroCouponBondParams
  ): HullWhiteResult {
    this.validateModel(model);
    const t = params.settlement ?? 0;
    const T = params.maturity;
    if (T <= t) throw new Error('maturity must be greater than settlement');

    const tau = T - t;
    const a = model.meanReversion;
    const sigma = model.volatility;
    const r = model.currentShortRate;

    const B = HullWhiteMath.computeB(a, tau);
    const logA = HullWhiteMath.computeLogA(a, sigma, tau);
    const A = Math.exp(logA);

    const bondPrice = A * Math.exp(-B * r);
    const yieldToMaturity = -Math.log(bondPrice) / tau;
    const forwardRate = (a * B - 1) * r + (sigma * sigma / (2 * a * a)) * (1 - Math.exp(-a * tau)) * (1 - Math.exp(-a * tau));

    return {
      bondPrice,
      yieldToMaturity,
      forwardRate,
      B,
      A,
    };
  }

  public static priceBondOption(
    model: HullWhiteModelParams,
    params: EuropeanBondOptionParams,
    computeGreeks: boolean = true
  ): EuropeanBondOptionResult {
    this.validateModel(model);
    const { optionMaturity: T_opt, bondMaturity: T_bnd, strikePrice: K, isCall } = params;
    if (T_opt <= 0) throw new Error('optionMaturity must be positive');
    if (T_bnd <= T_opt) throw new Error('bondMaturity must exceed optionMaturity');
    if (K <= 0) throw new Error('strikePrice must be positive');

    const pT = this.priceBond(model, { maturity: T_opt, settlement: 0 }).bondPrice;
    const pS = this.priceBond(model, { maturity: T_bnd, settlement: 0 }).bondPrice;

    const sigmaP = HullWhiteMath.computeOptionVolatility(
      model.meanReversion,
      model.volatility,
      T_opt,
      T_bnd
    );

    const d1 = (Math.log(pS / (pT * K)) + 0.5 * sigmaP * sigmaP) / sigmaP;
    const d2 = d1 - sigmaP;

    let optionPrice: number;
    if (isCall) {
      optionPrice = pS * HullWhiteMath.cdf(d1) - K * pT * HullWhiteMath.cdf(d2);
    } else {
      optionPrice = K * pT * HullWhiteMath.cdf(-d2) - pS * HullWhiteMath.cdf(-d1);
    }
    optionPrice = Math.max(0, optionPrice);

    const greeks = computeGreeks ? this.calculateOptionGreeks(model, params, optionPrice) : {
      deltaRate: 0,
      gammaRate: 0,
      vega: 0,
      theta: 0,
    };

    return {
      optionPrice,
      bondForwardPrice: pS / pT,
      strikePrice: K,
      optionMaturity: T_opt,
      bondMaturity: T_bnd,
      optionVolatility: sigmaP,
      d1,
      d2,
      greeks,
    };
  }

  private static calculateOptionGreeks(
    model: HullWhiteModelParams,
    params: EuropeanBondOptionParams,
    basePrice: number
  ) {
    const dr = 0.0001;
    const pUp = this.priceBondOption({ ...model, currentShortRate: model.currentShortRate + dr }, params, false).optionPrice;
    const pDown = this.priceBondOption({ ...model, currentShortRate: model.currentShortRate - dr }, params, false).optionPrice;
    const deltaRate = (pUp - pDown) / (2 * dr);
    const gammaRate = (pUp - 2 * basePrice + pDown) / (dr * dr);

    const dVol = 0.001;
    const pVolUp = this.priceBondOption({ ...model, volatility: model.volatility + dVol }, params, false).optionPrice;
    const vega = (pVolUp - basePrice) / dVol;

    const dT = 1 / 365;
    const pTDown = params.optionMaturity > dT
      ? this.priceBondOption(model, { ...params, optionMaturity: params.optionMaturity - dT, bondMaturity: params.bondMaturity - dT }, false).optionPrice
      : basePrice;
    const theta = (pTDown - basePrice) / dT;

    return { deltaRate, gammaRate, vega, theta };
  }
}

export { HullWhiteAnalyticalEngine as HullWhiteOptionEngine };

