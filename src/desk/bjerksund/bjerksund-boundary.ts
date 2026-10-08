export class BjerksundBoundary {
  public static calculateBeta(r: number, b: number, sigmaSq: number): number {
    const halfMinusB = 0.5 - b / sigmaSq;
    const termUnderSqrt = Math.pow(b / sigmaSq - 0.5, 2) + (2.0 * r) / sigmaSq;
    return halfMinusB + Math.sqrt(Math.max(1e-12, termUnderSqrt));
  }

  public static calculateBoundaries(
    K: number,
    T: number,
    r: number,
    b: number,
    sigma: number,
    beta: number
  ): { I1: number; I2: number; t1: number } {
    const bInf = (beta / (beta - 1.0)) * K;
    const b0 = Math.max(K, Math.abs(r - b) > 1e-6 ? (r / (r - b)) * K : K);

    // Bjerksund-Stensland (2002) time partition t1
    const t1 = 0.5 * (Math.sqrt(5.0) - 1.0) * T;

    const denom = Math.max(1e-6, (bInf - b0) * b0);
    const kSq = K * K;

    const h1 = -(b * t1 + 2.0 * sigma * Math.sqrt(t1)) * (kSq / denom);
    const I1 = b0 + (bInf - b0) * (1.0 - Math.exp(h1));

    const h2 = -(b * T + 2.0 * sigma * Math.sqrt(T)) * (kSq / denom);
    const I2 = b0 + (bInf - b0) * (1.0 - Math.exp(h2));

    return { I1, I2, t1 };
  }
}
