export class VasicekMath {
  /**
   * Affine sensitivity coefficient B(tau) = (1 - exp(-k * tau)) / k
   */
  public static calculateB(tau: number, k: number): number {
    if (tau <= 0) return 0;
    if (k < 1e-6) return tau;
    return (1.0 - Math.exp(-k * tau)) / k;
  }

  /**
   * Affine convexity term A(tau):
   * ln(A(tau)) = (theta - sigma^2 / (2*k^2)) * (B(tau) - tau) - (sigma^2 * B(tau)^2) / (4*k)
   */
  public static calculateA(tau: number, k: number, theta: number, sigma: number): number {
    if (tau <= 0) return 1.0;
    const B = this.calculateB(tau, k);
    const sigmaSq = sigma * sigma;
    const kSq = k * k;

    const term1 = (theta - sigmaSq / (2.0 * kSq)) * (B - tau);
    const term2 = (sigmaSq * B * B) / (4.0 * k);

    return Math.exp(term1 - term2);
  }

  /**
   * Instantaneous forward rate f(0, T) = -d ln(P(0, T)) / dT
   * f(0, T) = r_0 * exp(-k*T) + theta * (1 - exp(-k*T)) - (sigma^2 / (2*k^2)) * (1 - exp(-k*T))^2
   */
  public static calculateForwardRate(
    T: number,
    r0: number,
    k: number,
    theta: number,
    sigma: number
  ): number {
    if (T <= 0) return r0;
    const expTerm = Math.exp(-k * T);
    const oneMinusExp = 1.0 - expTerm;
    const convexity = (sigma * sigma / (2.0 * k * k)) * (oneMinusExp * oneMinusExp);

    return r0 * expTerm + theta * oneMinusExp - convexity;
  }
}
