import { BawOptionParams, BawGreeks, BawPricerResult } from './baw-types.js';
import { BawMath } from './baw-math.js';

export class BawEngine {
  public static validate(params: BawOptionParams): void {
    if (params.spot <= 0 || params.strike <= 0) {
      throw new Error('Spot and strike must be strictly positive.');
    }
    if (params.volatility <= 0) {
      throw new Error('Volatility must be strictly positive.');
    }
    if (params.timeToExpiry < 0) {
      throw new Error('Time to expiry cannot be negative.');
    }
  }

  public static price(params: BawOptionParams): BawPricerResult {
    this.validate(params);
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: sigma, isCall } = params;

    if (T === 0) {
      const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
      return {
        americanPrice: intrinsic,
        europeanPrice: intrinsic,
        earlyExercisePremium: 0,
        criticalSpot: K,
        greeks: { delta: isCall ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, vega: 0, theta: 0, rho: 0 },
        iterations: 0,
      };
    }

    const euro = BawMath.bsPrice(S, K, T, r, q, sigma, isCall);
    const europeanPrice = euro.price;
    const b = r - q;
    const sig2 = sigma * sigma;
    const M = 2.0 * r / sig2;
    const N = 2.0 * b / sig2;
    const K_T = 1.0 - Math.exp(-r * T);

    const { sStar, iterations } = BawMath.calculateCriticalSpot(params);
    let americanPrice = europeanPrice;

    if (isCall) {
      if (!isFinite(sStar) || sStar <= 0) {
        americanPrice = europeanPrice;
      } else if (S >= sStar) {
        americanPrice = S - K;
      } else {
        const q2 = (-(N - 1) + Math.sqrt(Math.pow(N - 1, 2) + 4.0 * M / K_T)) / 2.0;
        const bsStar = BawMath.bsPrice(sStar, K, T, r, q, sigma, true);
        const dfQ = Math.exp(-q * T);
        const A2 = (sStar / q2) * (1.0 - dfQ * BawMath.stdNormCdf(bsStar.d1));
        americanPrice = europeanPrice + A2 * Math.pow(S / sStar, q2);
      }
    } else {
      if (S <= sStar) {
        americanPrice = K - S;
      } else {
        const q1 = (-(N - 1) - Math.sqrt(Math.pow(N - 1, 2) + 4.0 * M / K_T)) / 2.0;
        const bsStar = BawMath.bsPrice(sStar, K, T, r, q, sigma, false);
        const dfQ = Math.exp(-q * T);
        const A1 = -(sStar / q1) * (1.0 - dfQ * BawMath.stdNormCdf(-bsStar.d1));
        americanPrice = europeanPrice + A1 * Math.pow(S / sStar, q1);
      }
    }

    americanPrice = Math.max(americanPrice, isCall ? Math.max(0, S - K) : Math.max(0, K - S), europeanPrice);
    const earlyExercisePremium = Math.max(0, americanPrice - europeanPrice);
    const greeks = this.calculateGreeks(params, americanPrice);

    return {
      americanPrice,
      europeanPrice,
      earlyExercisePremium,
      criticalSpot: sStar,
      greeks,
      iterations,
    };
  }

  private static calculateGreeks(params: BawOptionParams, basePrice: number): BawGreeks {
    const dS = params.spot * 0.001;
    const pUp = this.priceOnly({ ...params, spot: params.spot + dS });
    const pDn = this.priceOnly({ ...params, spot: params.spot - dS });
    const delta = (pUp - pDn) / (2 * dS);
    const gamma = (pUp - 2 * basePrice + pDn) / (dS * dS);

    const dSig = 0.001;
    const pSigUp = this.priceOnly({ ...params, volatility: params.volatility + dSig });
    const vega = (pSigUp - basePrice) / dSig;

    const dT = Math.min(1 / 365, params.timeToExpiry * 0.1);
    const pTDecay = params.timeToExpiry > dT
      ? this.priceOnly({ ...params, timeToExpiry: params.timeToExpiry - dT })
      : basePrice;
    const theta = -(pTDecay - basePrice) / dT;

    const dr = 0.0001;
    const prUp = this.priceOnly({ ...params, riskFreeRate: params.riskFreeRate + dr });
    const rho = (prUp - basePrice) / dr;

    return { delta, gamma, vega, theta, rho };
  }

  private static priceOnly(params: BawOptionParams): number {
    const { spot: S, strike: K, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: sigma, isCall } = params;
    if (T <= 0) return isCall ? Math.max(0, S - K) : Math.max(0, K - S);

    const euro = BawMath.bsPrice(S, K, T, r, q, sigma, isCall).price;
    const b = r - q;
    const sig2 = sigma * sigma;
    const M = 2.0 * r / sig2;
    const N = 2.0 * b / sig2;
    const K_T = 1.0 - Math.exp(-r * T);
    const { sStar } = BawMath.calculateCriticalSpot(params);

    if (isCall) {
      if (!isFinite(sStar) || sStar <= 0) return euro;
      if (S >= sStar) return S - K;
      const q2 = (-(N - 1) + Math.sqrt(Math.pow(N - 1, 2) + 4.0 * M / K_T)) / 2.0;
      const bsStar = BawMath.bsPrice(sStar, K, T, r, q, sigma, true);
      const dfQ = Math.exp(-q * T);
      const A2 = (sStar / q2) * (1.0 - dfQ * BawMath.stdNormCdf(bsStar.d1));
      return Math.max(euro + A2 * Math.pow(S / sStar, q2), S - K, euro);
    } else {
      if (S <= sStar) return K - S;
      const q1 = (-(N - 1) - Math.sqrt(Math.pow(N - 1, 2) + 4.0 * M / K_T)) / 2.0;
      const bsStar = BawMath.bsPrice(sStar, K, T, r, q, sigma, false);
      const dfQ = Math.exp(-q * T);
      const A1 = -(sStar / q1) * (1.0 - dfQ * BawMath.stdNormCdf(-bsStar.d1));
      return Math.max(euro + A1 * Math.pow(S / sStar, q1), K - S, euro);
    }
  }
}
