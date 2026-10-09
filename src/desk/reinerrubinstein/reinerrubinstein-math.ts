/**
 * Reiner-Rubinstein (1991) Mathematical Functions & Normal Distributions
 */

export class ReinerRubinsteinMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    if (x === 0) return 0.5;
    const isNegative = x < 0;
    const absX = Math.abs(x);

    const b1 = 0.31938153;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;

    const t = 1.0 / (1.0 + p * absX);
    const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
    const cdf = 1.0 - this.normalPdf(absX) * poly;

    return isNegative ? 1.0 - cdf : cdf;
  }

  /** Black-Scholes standard European vanilla price */
  public static vanillaPrice(
    S: number,
    K: number,
    T: number,
    r: number,
    b: number,
    sigma: number,
    isCall: boolean
  ): number {
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (b + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
    const d2 = d1 - sigma * sqrtT;

    const discountR = Math.exp(-r * T);
    const carryFactor = Math.exp((b - r) * T);

    if (isCall) {
      return S * carryFactor * this.normalCdf(d1) - K * discountR * this.normalCdf(d2);
    } else {
      return K * discountR * this.normalCdf(-d2) - S * carryFactor * this.normalCdf(-d1);
    }
  }
}
