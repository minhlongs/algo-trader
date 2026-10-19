/**
 * Turnbull-Wakeman (1991) Arithmetic Asian Option Valuation Engine
 */

import {
  TurnbullWakemanParams,
  TurnbullWakemanResult,
  TurnbullWakemanGreeks,
} from './turnbullwakeman-types.js';
import { TurnbullWakemanMath } from './turnbullwakeman-math.js';

export class TurnbullWakemanEngine {
  public static validate(params: TurnbullWakemanParams): void {
    if (params.spotPrice <= 0) throw new Error('spotPrice must be positive');
    if (params.strikePrice <= 0) throw new Error('strikePrice must be positive');
    if (params.timeToExpiry <= 0) throw new Error('timeToExpiry must be positive');
    if (params.volatility <= 0) throw new Error('volatility must be positive');
  }

  public static price(params: TurnbullWakemanParams, computeGreeks: boolean = true): TurnbullWakemanResult {
    this.validate(params);
    const {
      spotPrice: S,
      strikePrice: K,
      timeToExpiry: T,
      riskFreeRate: r,
      dividendYield = 0,
      volatility: sigma,
      isCall,
    } = params;

    const b = r - dividendYield;
    const { M1, M2, sigmaA } = TurnbullWakemanMath.computeMoments(S, T, r, b, sigma);

    const denom = sigmaA * Math.sqrt(T);
    const d1 = (Math.log(M1 / K) + 0.5 * sigmaA * sigmaA * T) / denom;
    const d2 = d1 - denom;

    const df = Math.exp(-r * T);
    let optionPrice: number;

    if (isCall) {
      optionPrice = df * (M1 * TurnbullWakemanMath.cdf(d1) - K * TurnbullWakemanMath.cdf(d2));
    } else {
      optionPrice = df * (K * TurnbullWakemanMath.cdf(-d2) - M1 * TurnbullWakemanMath.cdf(-d1));
    }

    optionPrice = Math.max(0, optionPrice);

    // Parity check: Call - Put = e^(-rT) * (M1 - K)
    const parityTheoretical = df * (M1 - K);
    const callPrice = df * (M1 * TurnbullWakemanMath.cdf(d1) - K * TurnbullWakemanMath.cdf(d2));
    const putPrice = df * (K * TurnbullWakemanMath.cdf(-d2) - M1 * TurnbullWakemanMath.cdf(-d1));
    const putCallParityDeviation = Math.abs((callPrice - putPrice) - parityTheoretical);

    const greeks = computeGreeks ? this.calculateGreeks(params, optionPrice) : {
      delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0,
    };

    return {
      optionPrice,
      firstMoment: M1,
      secondMoment: M2,
      effectiveVol: sigmaA,
      d1,
      d2,
      putCallParityDeviation,
      greeks,
    };
  }

  private static calculateGreeks(
    params: TurnbullWakemanParams,
    basePrice: number
  ): TurnbullWakemanGreeks {
    const dS = params.spotPrice * 0.001;
    const pUp = this.price({ ...params, spotPrice: params.spotPrice + dS }, false).optionPrice;
    const pDown = this.price({ ...params, spotPrice: params.spotPrice - dS }, false).optionPrice;
    const delta = (pUp - pDown) / (2 * dS);
    const gamma = (pUp - 2 * basePrice + pDown) / (dS * dS);

    const dVol = 0.001;
    const pVolUp = this.price({ ...params, volatility: params.volatility + dVol }, false).optionPrice;
    const vega = (pVolUp - basePrice) / dVol;

    const dT = 1 / 365;
    const pTDown = params.timeToExpiry > dT
      ? this.price({ ...params, timeToExpiry: params.timeToExpiry - dT }, false).optionPrice
      : basePrice;
    const theta = (pTDown - basePrice) / dT;

    const dR = 0.0001;
    const pRUp = this.price({ ...params, riskFreeRate: params.riskFreeRate + dR }, false).optionPrice;
    const rho = (pRUp - basePrice) / dR;

    return { delta, gamma, vega, theta, rho };
  }
}
