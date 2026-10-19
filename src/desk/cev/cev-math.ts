export class CevMath {
  /**
   * Log-gamma function via Lanczos approximation (g=5, n=6)
   */
  public static logGamma(z: number): number {
    const c = [
      76.18009172947146,
      -86.50532032941677,
      24.01409824083091,
      -1.231739572450155,
      0.001208650973866179,
      -0.000005395239384953,
    ];
    let x = z;
    let y = z;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j <= 5; j++) {
      ser += c[j] / ++y;
    }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /**
   * Regularized lower incomplete gamma P(a, x) = gamma(a, x) / Gamma(a)
   */
  public static gammp(a: number, x: number): number {
    if (x <= 0) return 0;
    if (a <= 0) return 1;

    // For large a, use Wilson-Hilferty transformation
    if (a > 50) {
      const y = x / a;
      const w = (Math.pow(y, 1 / 3) - (1 - 1 / (9 * a))) / Math.sqrt(1 / (9 * a));
      return this.normalCdf(w);
    }

    let sum = 1.0 / a;
    let term = 1.0 / a;
    for (let n = 1; n < 150; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    const val = sum * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
    return Math.min(1.0, Math.max(0.0, val));
  }

  /**
   * Cumulative distribution function of Non-Central Chi-Square distribution F(x; nu, lambda)
   * Uses Poisson series expansion for small lambda, and Sankaran (1963) / Patnaik transformation for large lambda.
   */
  public static nonCentralChiSquareCdf(x: number, nu: number, lambda: number): number {
    if (x <= 0) return 0;
    if (lambda <= 1e-8) {
      return this.gammp(nu / 2, x / 2);
    }

    // For large lambda or large x, use Sankaran (1963) normal approximation
    if (lambda > 30 || x > 100) {
      const h = 1.0 - (2.0 / 3.0) * ((nu + lambda) * (nu + 3.0 * lambda)) / Math.pow(nu + 2.0 * lambda, 2);
      const p = (nu + 2.0 * lambda) / Math.pow(nu + lambda, 2);
      const m = (h - 1.0) * (1.0 - 3.0 * h);
      const muZ = 1.0 + h * p * (h - 1.0 - 0.5 * (2.0 - h) * m * p);
      const sigmaZ = h * Math.sqrt(2.0 * p) * (1.0 + 0.5 * m * p);

      const ratio = x / (nu + lambda);
      if (ratio <= 0) return 0;
      const z = (Math.pow(ratio, h) - muZ) / sigmaZ;
      return this.normalCdf(z);
    }

    const halfLambda = lambda / 2;
    const halfX = x / 2;
    const halfNu = nu / 2;

    let prob = 0;
    let pK = Math.exp(-halfLambda); // Poisson P(K = 0)
    let gK = this.gammp(halfNu, halfX); // Gamma P(halfNu, halfX)

    prob += pK * gK;

    for (let k = 1; k < 150; k++) {
      pK *= halfLambda / k;
      gK = this.gammp(halfNu + k, halfX);
      const term = pK * gK;
      prob += term;
      if (term < 1e-12 && k > halfLambda) break;
    }

    return Math.min(1.0, Math.max(0.0, prob));
  }

  /**
   * Standard normal cumulative distribution function
   */
  public static normalCdf(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }
}
