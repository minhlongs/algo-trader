import { BawOptionParams } from './baw-types.js';

export class BawMath {
  public static stdNormPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static stdNormCdf(x: number): number {
    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 0.3989422804014337;

    if (x >= 0) {
      const k = 1.0 / (1.0 + p * x);
      return 1.0 - c * Math.exp(-x * x / 2.0) * k *
        (b1 + k * (b2 + k * (b3 + k * (b4 + k * b5))));
    } else {
      const k = 1.0 / (1.0 - p * x);
      return c * Math.exp(-x * x / 2.0) * k *
        (b1 + k * (b2 + k * (b3 + k * (b4 + k * b5))));
    }
  }

  public static bsPrice(
    S: number,
    K: number,
    T: number,
    r: number,
    q: number,
    sigma: number,
    isCall: boolean
  ): { price: number; d1: number; d2: number } {
    if (T <= 0) {
      const intrinsic = isCall ? Math.max(0, S - K) : Math.max(0, K - S);
      return { price: intrinsic, d1: 0, d2: 0 };
    }
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const dfR = Math.exp(-r * T);
    const dfQ = Math.exp(-q * T);

    if (isCall) {
      const price = S * dfQ * this.stdNormCdf(d1) - K * dfR * this.stdNormCdf(d2);
      return { price: Math.max(0, price), d1, d2 };
    } else {
      const price = K * dfR * this.stdNormCdf(-d2) - S * dfQ * this.stdNormCdf(-d1);
      return { price: Math.max(0, price), d1, d2 };
    }
  }

  public static calculateCriticalSpot(params: BawOptionParams): { sStar: number; iterations: number } {
    const { strike: K, timeToExpiry: T, riskFreeRate: r, dividendYield: q, volatility: sigma, isCall } = params;
    const b = r - q;
    const sig2 = sigma * sigma;
    const M = 2.0 * r / sig2;
    const N = 2.0 * b / sig2;
    const K_T = 1.0 - Math.exp(-r * T);
    const tol = 1e-6;
    const maxIter = 100;

    if (isCall) {
      if (b >= r) {
        return { sStar: Number.POSITIVE_INFINITY, iterations: 0 };
      }
      const q2 = (-(N - 1) + Math.sqrt(Math.pow(N - 1, 2) + 4.0 * M / K_T)) / 2.0;
      let sStar = K / (1.0 - 1.0 / q2);
      let iter = 0;

      while (iter < maxIter) {
        iter++;
        const bs = this.bsPrice(sStar, K, T, r, q, sigma, true);
        const dfQ = Math.exp(-q * T);
        const nD1 = this.stdNormCdf(bs.d1);
        const npD1 = this.stdNormPdf(bs.d1);
        const lhs = sStar - K;
        const rhs = bs.price + (1.0 - dfQ * nD1) * sStar / q2;
        const diff = lhs - rhs;
        if (Math.abs(diff) < tol) break;

        const slope = (1.0 - dfQ * nD1) * (1.0 - 1.0 / q2) + (dfQ * npD1 / (sigma * Math.sqrt(T))) * (1.0 / q2);
        sStar = sStar - diff / slope;
        if (sStar < K) sStar = K;
      }
      return { sStar, iterations: iter };
    } else {
      const q1 = (-(N - 1) - Math.sqrt(Math.pow(N - 1, 2) + 4.0 * M / K_T)) / 2.0;
      let sStar = K / (1.0 - 1.0 / q1);
      let iter = 0;

      while (iter < maxIter) {
        iter++;
        const bs = this.bsPrice(sStar, K, T, r, q, sigma, false);
        const dfQ = Math.exp(-q * T);
        const nMinusD1 = this.stdNormCdf(-bs.d1);
        const npD1 = this.stdNormPdf(bs.d1);
        const lhs = K - sStar;
        const rhs = bs.price - (1.0 - dfQ * nMinusD1) * sStar / q1;
        const diff = lhs - rhs;
        if (Math.abs(diff) < tol) break;

        const slope = -(1.0 - dfQ * nMinusD1) * (1.0 - 1.0 / q1) + (dfQ * npD1 / (sigma * Math.sqrt(T))) * (1.0 / q1);
        sStar = sStar - diff / slope;
        if (sStar > K) sStar = K * 0.99;
        if (sStar <= 0) sStar = K * 0.1;
      }
      return { sStar, iterations: iter };
    }
  }
}
