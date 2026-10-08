import { GeskeParams, GeskeResult } from './geske-types';
import { GeskeMath } from './geske-math';

export class GeskeEngine {
  public static calculate(params: GeskeParams): GeskeResult {
    const {
      spotPrice: S,
      strike1: K1,
      strike2: K2,
      maturity1: T1,
      maturity2: T2,
      riskFreeRate: r,
      dividendYield: q,
      volatility: sigma,
      optionType,
    } = params;

    if (S <= 0 || K1 <= 0 || K2 <= 0 || T1 <= 0 || T2 <= 0 || sigma <= 0) {
      throw new Error('Prices, strikes, maturities, and volatility must be strictly positive');
    }

    if (T1 >= T2) {
      throw new Error('Compound maturity T1 must be strictly less than underlying maturity T2');
    }

    const underlyingIsCall = optionType === 'CallOnCall' || optionType === 'PutOnCall';
    const sStar = GeskeMath.solveCriticalPrice(K1, K2, T2 - T1, r, q, sigma, underlyingIsCall);

    const price = this.priceInternal(S, K1, K2, T1, T2, r, q, sigma, optionType, sStar);
    const underlyingBs = GeskeMath.blackScholesPrice(S, K2, T2, r, q, sigma, underlyingIsCall);

    // Compute numerical Greeks
    const epsS = Math.max(1e-4, S * 0.001);
    const pUp = this.priceInternal(S + epsS, K1, K2, T1, T2, r, q, sigma, optionType, sStar);
    const pDown = this.priceInternal(S - epsS, K1, K2, T1, T2, r, q, sigma, optionType, sStar);
    const delta = (pUp - pDown) / (2.0 * epsS);
    const gamma = (pUp - 2.0 * price + pDown) / (epsS * epsS);

    const epsVol = 0.001;
    const pVolUp = this.priceInternal(S, K1, K2, T1, T2, r, q, sigma + epsVol, optionType, sStar);
    const pVolDown = this.priceInternal(S, K1, K2, T1, T2, r, q, Math.max(1e-4, sigma - epsVol), optionType, sStar);
    const vega = (pVolUp - pVolDown) / (2.0 * epsVol);

    const dt = 1.0 / 365.0;
    const pTime = this.priceInternal(S, K1, K2, Math.max(1e-4, T1 - dt), Math.max(2e-4, T2 - dt), r, q, sigma, optionType, sStar);
    const theta = (pTime - price) / dt;

    return {
      price: Math.max(0.0, price),
      criticalPrice: sStar,
      rho: Math.sqrt(T1 / T2),
      underlyingOptionPrice: underlyingBs.price,
      delta,
      gamma,
      theta,
      vega,
    };
  }

  private static priceInternal(
    S: number,
    K1: number,
    K2: number,
    T1: number,
    T2: number,
    r: number,
    q: number,
    sigma: number,
    optionType: string,
    sStar: number
  ): number {
    const rho = Math.sqrt(T1 / T2);
    const sqrtT1 = Math.sqrt(T1);
    const sqrtT2 = Math.sqrt(T2);

    const h1 = (Math.log(S / sStar) + (r - q + 0.5 * sigma * sigma) * T1) / (sigma * sqrtT1);
    const h2 = h1 - sigma * sqrtT1;
    const k1 = (Math.log(S / K2) + (r - q + 0.5 * sigma * sigma) * T2) / (sigma * sqrtT2);
    const k2 = k1 - sigma * sqrtT2;

    const dfR1 = Math.exp(-r * T1);
    const dfR2 = Math.exp(-r * T2);
    const dfQ2 = Math.exp(-q * T2);

    switch (optionType) {
      case 'CallOnCall': {
        const m1 = GeskeMath.bivariateNormalCdf(h1, k1, rho);
        const m2 = GeskeMath.bivariateNormalCdf(h2, k2, rho);
        const nH2 = GeskeMath.normalCdf(h2);
        return S * dfQ2 * m1 - K2 * dfR2 * m2 - K1 * dfR1 * nH2;
      }
      case 'PutOnCall': {
        const m1 = GeskeMath.bivariateNormalCdf(-h1, k1, -rho);
        const m2 = GeskeMath.bivariateNormalCdf(-h2, k2, -rho);
        const nNegH2 = GeskeMath.normalCdf(-h2);
        return K2 * dfR2 * m2 - S * dfQ2 * m1 + K1 * dfR1 * nNegH2;
      }
      case 'CallOnPut': {
        const m1 = GeskeMath.bivariateNormalCdf(-h1, -k1, rho);
        const m2 = GeskeMath.bivariateNormalCdf(-h2, -k2, rho);
        const nNegH2 = GeskeMath.normalCdf(-h2);
        return K2 * dfR2 * m2 - S * dfQ2 * m1 - K1 * dfR1 * nNegH2;
      }
      case 'PutOnPut': {
        const m1 = GeskeMath.bivariateNormalCdf(h1, -k1, -rho);
        const m2 = GeskeMath.bivariateNormalCdf(h2, -k2, -rho);
        const nH2 = GeskeMath.normalCdf(h2);
        return S * dfQ2 * m1 - K2 * dfR2 * m2 + K1 * dfR1 * nH2;
      }
      default:
        throw new Error(`Unsupported option type: ${optionType}`);
    }
  }
}
