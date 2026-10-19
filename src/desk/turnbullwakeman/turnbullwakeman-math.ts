/**
 * Turnbull-Wakeman (1991) Mathematical Moments and CDF
 */

export class TurnbullWakemanMath {
  public static cdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;

    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  public static computeMoments(
    S: number,
    T: number,
    r: number,
    b: number,
    sigma: number
  ): { M1: number; M2: number; sigmaA: number } {
    const sig2 = sigma * sigma;

    let M1: number;
    if (Math.abs(b) < 1e-8) {
      M1 = S;
    } else {
      M1 = (S / (b * T)) * (Math.exp(b * T) - 1.0);
    }

    let M2: number;
    if (Math.abs(b) < 1e-8) {
      M2 = (2 * S * S / (sig2 * T * T)) * ((Math.exp(sig2 * T) - 1.0) / sig2 - T);
    } else if (Math.abs(2 * b + sig2) < 1e-8) {
      M2 = (2 * S * S / (T * T)) * (T / b - (Math.exp(b * T) - 1.0) / (b * b));
    } else {
      const term1 = (Math.exp((2 * b + sig2) * T) - 1.0) / (2 * b + sig2);
      const term2 = (Math.exp(b * T) - 1.0) / b;
      M2 = (2 * S * S / ((b + sig2) * T * T)) * (term1 - term2);
    }

    // Guard against numerical variance truncation
    const ratio = Math.max(1e-12, M2 / (M1 * M1));
    const sigmaA = Math.sqrt(Math.max(1e-8, Math.log(ratio) / T));

    return { M1, M2, sigmaA };
  }
}
