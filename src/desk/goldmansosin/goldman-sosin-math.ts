export class GoldmanSosinMath {
  public static stdNormPdf(x: number): number {
    return (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.exp(-0.5 * x * x);
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

  public static priceFloatingCall(
    S: number,
    m: number,
    tau: number,
    r: number,
    q: number,
    sigma: number
  ): number {
    const minVal = Math.min(S, Math.max(1e-12, m));
    const b = r - q;
    const sigRootT = sigma * Math.sqrt(tau);
    const a1 = (Math.log(S / minVal) + (b + 0.5 * sigma * sigma) * tau) / sigRootT;
    const a2 = a1 - sigRootT;

    const term1 = S * Math.exp(-q * tau) * this.stdNormCdf(a1);
    const term2 = minVal * Math.exp(-r * tau) * this.stdNormCdf(a2);

    if (Math.abs(b) < 1e-8) {
      const limitTerm = S * Math.exp(-r * tau) * (sigRootT * this.stdNormPdf(a1) - Math.log(S / minVal) * this.stdNormCdf(-a1));
      return Math.max(0.0, term1 - term2 + limitTerm);
    }

    const factor = (S * Math.exp(-r * tau) * (sigma * sigma)) / (2.0 * b);
    const powerTerm = Math.pow(S / minVal, (-2.0 * b) / (sigma * sigma));
    const cdf1 = this.stdNormCdf(-a1 + (2.0 * b * Math.sqrt(tau)) / sigma);
    const cdf2 = Math.exp(b * tau) * this.stdNormCdf(-a1);
    const term3 = factor * (powerTerm * cdf1 - cdf2);

    return Math.max(0.0, term1 - term2 + term3);
  }

  public static priceFloatingPut(
    S: number,
    M: number,
    tau: number,
    r: number,
    q: number,
    sigma: number
  ): number {
    const maxVal = Math.max(S, M);
    const b = r - q;
    const sigRootT = sigma * Math.sqrt(tau);
    const b1 = (Math.log(S / maxVal) + (b + 0.5 * sigma * sigma) * tau) / sigRootT;
    const b2 = b1 - sigRootT;

    const term1 = maxVal * Math.exp(-r * tau) * this.stdNormCdf(-b2);
    const term2 = S * Math.exp(-q * tau) * this.stdNormCdf(-b1);

    if (Math.abs(b) < 1e-8) {
      const limitTerm = S * Math.exp(-r * tau) * (sigRootT * this.stdNormPdf(b1) + Math.log(S / maxVal) * this.stdNormCdf(b1));
      return Math.max(0.0, term1 - term2 + limitTerm);
    }

    const factor = (S * Math.exp(-r * tau) * (sigma * sigma)) / (2.0 * b);
    const powerTerm = Math.pow(S / maxVal, (-2.0 * b) / (sigma * sigma));
    const cdf1 = this.stdNormCdf(b1 - (2.0 * b * Math.sqrt(tau)) / sigma);
    const cdf2 = Math.exp(b * tau) * this.stdNormCdf(b1);
    const term3 = factor * (-powerTerm * cdf1 + cdf2);

    return Math.max(0.0, term1 - term2 + term3);
  }
}
