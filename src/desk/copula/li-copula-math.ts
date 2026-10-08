export class LiCopulaMath {
  public static normalCdf(x: number): number {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const t = 1.0 / (1.0 + (p * Math.abs(x)) / Math.SQRT2);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2.0);
    return 0.5 * (1.0 + sign * y);
  }

  public static normalPdf(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2.0 * Math.PI);
  }

  /**
   * Rational approximation of the Inverse Standard Normal CDF (Acklam / Beasley-Springer-Moro).
   */
  public static inverseNormalCdf(p: number): number {
    if (p <= 0) return -8.0;
    if (p >= 1) return 8.0;

    const a = [
      -3.969683028665376e+01,  2.209460984245205e+02,
      -2.759285104469687e+02,  1.383577518672690e+02,
      -3.066479806614716e+01,  2.506628277459239e+00
    ];
    const b = [
      -5.447609879822406e+01,  1.615858368580409e+02,
      -1.556989798598866e+02,  6.680131188771972e+01,
      -1.328068155288572e+01
    ];
    const c = [
      -7.784894002430293e-03, -3.223964580411365e-01,
      -2.400758277161838e+00, -2.549732539343734e+00,
       4.374664141464968e+00,  2.938163982698783e+00
    ];
    const d = [
       7.784695709041462e-03,  3.224671290700398e-01,
       2.445134137142996e+00,  3.754408661907416e+00
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number, r: number;
    if (p < pLow) {
      q = Math.sqrt(-2.0 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1.0);
    } else {
      q = Math.sqrt(-2.0 * Math.log(1.0 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1.0);
    }
  }

  /**
   * Bivariate standard normal CDF Phi2(x1, x2; rho) via numerical integration.
   */
  public static bivariateNormalCdf(x1: number, x2: number, rho: number): number {
    if (rho === 0) return this.normalCdf(x1) * this.normalCdf(x2);
    if (rho >= 1.0) return this.normalCdf(Math.min(x1, x2));
    if (rho <= -1.0) return Math.max(0, this.normalCdf(x1) + this.normalCdf(x2) - 1.0);

    // Phi2(x1, x2; rho) = integral_{-inf}^{x1} phi(u) * Phi( (x2 - rho*u)/sqrt(1 - rho^2) ) du
    const lower = -6.0;
    const upper = Math.max(lower, Math.min(6.0, x1));
    if (upper <= lower) return 0.0;

    const steps = 60;
    const du = (upper - lower) / steps;
    const sqrtRho = Math.sqrt(1.0 - rho * rho);
    let sum = 0.0;

    for (let i = 0; i < steps; i++) {
      const uMid = lower + (i + 0.5) * du;
      const integrand = this.normalPdf(uMid) * this.normalCdf((x2 - rho * uMid) / sqrtRho);
      sum += integrand * du;
    }

    return Math.min(Math.min(this.normalCdf(x1), this.normalCdf(x2)), Math.max(0.0, sum));
  }
}
