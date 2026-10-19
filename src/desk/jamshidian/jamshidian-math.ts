export class JamshidianMath {
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
    const erf = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * erf);
  }

  /**
   * Vasicek B(tau) = (1 - exp(-kappa * tau)) / kappa
   */
  public static vasicekB(tau: number, kappa: number): number {
    if (Math.abs(kappa) < 1e-8) return tau;
    return (1.0 - Math.exp(-kappa * tau)) / kappa;
  }

  /**
   * Vasicek A(tau) = exp( (theta - sigma^2 / (2 * kappa^2)) * (B(tau) - tau) - (sigma^2 / (4 * kappa)) * B(tau)^2 )
   */
  public static vasicekA(tau: number, kappa: number, theta: number, sigma: number): number {
    const B = this.vasicekB(tau, kappa);
    const term1 = (theta - (sigma * sigma) / (2.0 * kappa * kappa)) * (B - tau);
    const term2 = ((sigma * sigma) / (4.0 * kappa)) * B * B;
    return Math.exp(term1 - term2);
  }

  /**
   * Vasicek zero bond price P(r, tau) = A(tau) * exp(-B(tau) * r)
   */
  public static vasicekZeroBond(r: number, tau: number, kappa: number, theta: number, sigma: number): number {
    const B = this.vasicekB(tau, kappa);
    const A = this.vasicekA(tau, kappa, theta, sigma);
    return A * Math.exp(-B * r);
  }
}
