import {
  Bjerksund93Params,
  Bjerksund93Result,
  Bjerksund93Greeks,
} from './bjerksund93-types.js';
import { Bjerksund93Math } from './bjerksund93-math.js';

export class Bjerksund93Engine {
  public static validate(params: Bjerksund93Params): void {
    if (params.spot <= 0) throw new Error('Spot price must be positive');
    if (params.strike <= 0) throw new Error('Strike price must be positive');
    if (params.timeToExpiry <= 0) throw new Error('Time to expiry must be positive');
    if (params.volatility <= 0) throw new Error('Volatility must be positive');
  }

  public static priceCall(S: number, K: number, T: number, r: number, b: number, v: number): { price: number; I: number } {
    if (b >= r) {
      // European Black-Scholes call is optimal if cost of carry >= r (no dividend incentive)
      const d1 = (Math.log(S / K) + (b + 0.5 * v * v) * T) / (v * Math.sqrt(T));
      const d2 = d1 - v * Math.sqrt(T);
      const bs = S * Math.exp((b - r) * T) * Bjerksund93Math.normalCdf(d1) - K * Math.exp(-r * T) * Bjerksund93Math.normalCdf(d2);
      return { price: Math.max(0, bs), I: Infinity };
    }

    const beta = (0.5 - b / (v * v)) + Math.sqrt(Math.pow(b / (v * v) - 0.5, 2) + (2 * r) / (v * v));
    const BInf = (beta / (beta - 1)) * K;
    const B0 = Math.max(K, (r / (r - b)) * K);
    const hT = -(b * T + 2 * v * Math.sqrt(T)) * ((K * K) / ((BInf - B0) * B0));
    const I = B0 + (BInf - B0) * (1 - Math.exp(hT));

    if (S >= I) {
      return { price: S - K, I };
    }

    const alpha = (I - K) * Math.pow(I, -beta);
    const price =
      alpha * Math.pow(S, beta) -
      alpha * Bjerksund93Math.phi(S, T, beta, I, I, r, b, v) +
      Bjerksund93Math.phi(S, T, 1, I, I, r, b, v) -
      Bjerksund93Math.phi(S, T, 1, K, I, r, b, v) -
      K * Bjerksund93Math.phi(S, T, 0, I, I, r, b, v) +
      K * Bjerksund93Math.phi(S, T, 0, K, I, r, b, v);

    return { price: Math.max(0, price), I };
  }

  public static price(params: Bjerksund93Params): Bjerksund93Result {
    this.validate(params);
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: v, isCall } = params;
    const b = r - q;

    let price = 0;
    let triggerPrice = 0;

    if (isCall) {
      const res = this.priceCall(S, K, T, r, b, v);
      price = res.price;
      triggerPrice = res.I;
    } else {
      // Put-Call transformation symmetry: Put(S, K, T, r, b, v) = Call(K, S, T, r - b, -b, v)
      const res = this.priceCall(K, S, T, r - b, -b, v);
      price = res.price;
      triggerPrice = res.I;
    }

    // Finite difference Greeks
    const epsS = S * 0.001;
    const pUp = isCall ? this.priceCall(S + epsS, K, T, r, b, v).price : this.priceCall(K, S + epsS, T, r - b, -b, v).price;
    const pDn = isCall ? this.priceCall(S - epsS, K, T, r, b, v).price : this.priceCall(K, S - epsS, T, r - b, -b, v).price;
    const delta = (pUp - pDn) / (2 * epsS);
    const gamma = (pUp - 2 * price + pDn) / (epsS * epsS);

    const epsV = 0.001;
    const pVUp = isCall ? this.priceCall(S, K, T, r, b, v + epsV).price : this.priceCall(K, S, T, r - b, -b, v + epsV).price;
    const vega = (pVUp - price) / epsV;

    const epsT = Math.min(T * 0.01, 1 / 365);
    const pTDown = isCall ? this.priceCall(S, K, T - epsT, r, b, v).price : this.priceCall(K, S, T - epsT, r - b, -b, v).price;
    const theta = -(price - pTDown) / epsT;

    const epsR = 0.0001;
    const pRUp = isCall ? this.priceCall(S, K, T, r + epsR, b + epsR, v).price : this.priceCall(K, S, T, r + epsR - (b + epsR), -(b + epsR), v).price;
    const rho = (pRUp - price) / epsR;

    const greeks: Bjerksund93Greeks = { delta, gamma, vega, theta, rho };
    const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);

    return {
      price,
      triggerPrice,
      earlyExercisePremium: Math.max(0, price - intrinsic),
      greeks,
    };
  }
}
