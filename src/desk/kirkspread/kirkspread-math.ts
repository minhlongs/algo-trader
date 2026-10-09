export class KirkSpreadMath {
  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  public static normalCdf(x: number): number {
    if (x < -10) return 0;
    if (x > 10) return 1;

    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c = 1.0 / Math.sqrt(2 * Math.PI);

    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
    const cdf = 1.0 - c * Math.exp(-0.5 * absX * absX) * poly;

    return x >= 0 ? cdf : 1.0 - cdf;
  }

  /**
   * Computes Kirk's equivalent volatility:
   * sigma* = sqrt( sigma1^2 + (w * sigma2)^2 - 2 * rho * sigma1 * (w * sigma2) )
   * where w = F2 / (F2 + K)
   */
  public static calculateAdjustedVolatility(
    f1: number,
    f2: number,
    k: number,
    sigma1: number,
    sigma2: number,
    rho: number
  ): number {
    const denom = f2 + k;
    const w = f2 / denom;
    const term1 = sigma1 * sigma1;
    const term2 = Math.pow(w * sigma2, 2);
    const term3 = 2.0 * rho * sigma1 * (w * sigma2);
    const variance = Math.max(1e-12, term1 + term2 - term3);
    return Math.sqrt(variance);
  }
}
