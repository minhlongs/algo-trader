import { AsianGreeks, AsianOptionParams, AsianPriceResult } from './asian-types';
import { AsianMath } from './asian-math';

export class AsianEngine {
  public static calculate(params: AsianOptionParams): AsianPriceResult {
    const { spot: S, strike: K, riskFreeRate: r, volatility: sigma, timeToExpiry: T } = params;
    const q = params.dividendYield ?? 0.0;

    if (S <= 0 || K <= 0) throw new Error('spot and strike must be > 0');
    if (sigma <= 0) throw new Error('volatility must be > 0');
    if (T <= 0) throw new Error('timeToExpiry must be > 0');

    const geom = AsianMath.priceGeometric(S, K, T, r, q, sigma);
    const arith = AsianMath.priceArithmetic(S, K, T, r, q, sigma);
    const greeks = this.calculateArithmeticGreeks(S, K, T, r, q, sigma, arith.call);

    return {
      geometricCall: geom.call,
      geometricPut: geom.put,
      arithmeticCall: arith.call,
      arithmeticPut: arith.put,
      effectiveVolatility: arith.sigmaA,
      expectedAverage: arith.m1,
      greeks,
    };
  }

  private static calculateArithmeticGreeks(
    S: number,
    K: number,
    T: number,
    r: number,
    q: number,
    sigma: number,
    baseCall: number
  ): AsianGreeks {
    const dS = Math.max(1e-4, S * 0.001);
    const cUp = AsianMath.priceArithmetic(S + dS, K, T, r, q, sigma).call;
    const cDown = AsianMath.priceArithmetic(S - dS, K, T, r, q, sigma).call;
    const delta = (cUp - cDown) / (2.0 * dS);
    const gamma = (cUp - 2.0 * baseCall + cDown) / (dS * dS);

    const dVol = 0.001;
    const cVolUp = AsianMath.priceArithmetic(S, K, T, r, q, sigma + dVol).call;
    const vega = (cVolUp - baseCall) / (dVol * 100.0);

    const dT = Math.min(1e-3, T * 0.01);
    const cTimeDown = AsianMath.priceArithmetic(S, K, Math.max(1e-5, T - dT), r, q, sigma).call;
    const theta = (cTimeDown - baseCall) / dT;

    const dr = 0.0001;
    const cRateUp = AsianMath.priceArithmetic(S, K, T, r + dr, q, sigma).call;
    const rho = (cRateUp - baseCall) / (dr * 100.0);

    return { delta, gamma, vega, theta, rho };
  }
}
