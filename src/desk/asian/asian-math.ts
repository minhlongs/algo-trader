export class AsianMath {
  public static stdNormPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  public static stdNormCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const erf = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * erf);
  }

  public static priceGeometric(S: number, K: number, T: number, r: number, q: number, sigma: number): { call: number; put: number } {
    const b = r - q;
    const sigHat = sigma / Math.sqrt(3.0);
    const bHat = 0.5 * (b - (sigma * sigma) / 6.0);
    const sigRootT = sigHat * Math.sqrt(T);

    const d1 = (Math.log(S / K) + (bHat + 0.5 * sigHat * sigHat) * T) / sigRootT;
    const d2 = d1 - sigRootT;

    const discountS = S * Math.exp((bHat - r) * T);
    const discountK = K * Math.exp(-r * T);

    const call = Math.max(0.0, discountS * this.stdNormCdf(d1) - discountK * this.stdNormCdf(d2));
    const put = Math.max(0.0, discountK * this.stdNormCdf(-d2) - discountS * this.stdNormCdf(-d1));
    return { call, put };
  }

  public static computeArithmeticMoments(S: number, T: number, b: number, sigma: number): { m1: number; m2: number; sigmaA: number } {
    let m1: number;
    let m2: number;

    if (Math.abs(b) < 1e-8) {
      m1 = S;
      const s2 = sigma * sigma;
      m2 = (2.0 * S * S) / (s2 * T * T) * ((Math.exp(s2 * T) - 1.0) / s2 - T);
    } else {
      m1 = (S * (Math.exp(b * T) - 1.0)) / (b * T);
      const bPlusSig2 = b + sigma * sigma;
      const termA = (Math.exp((2.0 * b + sigma * sigma) * T) - 1.0) / (2.0 * b + sigma * sigma);
      const termB = (Math.exp(b * T) - 1.0) / b;
      m2 = ((2.0 * S * S) / (T * T * bPlusSig2)) * (termA - termB);
    }

    const varRatio = Math.max(1e-12, Math.log(Math.max(1.0 + 1e-12, m2 / (m1 * m1))));
    const sigmaA = Math.sqrt(varRatio / T);
    return { m1, m2, sigmaA };
  }

  public static priceArithmetic(S: number, K: number, T: number, r: number, q: number, sigma: number): { call: number; put: number; m1: number; sigmaA: number } {
    const b = r - q;
    const { m1, sigmaA } = this.computeArithmeticMoments(S, T, b, sigma);
    const sigRootT = Math.max(1e-9, sigmaA * Math.sqrt(T));

    const d1 = (Math.log(m1 / K) + 0.5 * sigmaA * sigmaA * T) / sigRootT;
    const d2 = d1 - sigRootT;

    const discount = Math.exp(-r * T);
    const call = Math.max(0.0, discount * (m1 * this.stdNormCdf(d1) - K * this.stdNormCdf(d2)));
    const put = Math.max(0.0, discount * (K * this.stdNormCdf(-d2) - m1 * this.stdNormCdf(-d1)));
    return { call, put, m1, sigmaA };
  }
}
