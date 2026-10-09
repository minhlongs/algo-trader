/**
 * Hull-White (1990) Analytical Mathematics
 */

export class HullWhiteMath {
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

  /**
   * B(t, T) = (1 - e^(-a*(T - t))) / a
   */
  public static computeB(a: number, tau: number): number {
    if (Math.abs(a) < 1e-8) {
      return tau;
    }
    return (1.0 - Math.exp(-a * tau)) / a;
  }

  /**
   * Under constant theta (or flat initial curve r0):
   * ln A(t, T) = - (sigma^2 / (2 * a^2)) * [ tau - B(tau) - (a / 2) * B(tau)^2 ]
   */
  public static computeLogA(a: number, sigma: number, tau: number): number {
    const B_tau = this.computeB(a, tau);
    const sig2 = sigma * sigma;
    const a2 = a * a;
    if (Math.abs(a) < 1e-8) {
      return -0.5 * sig2 * tau * tau * tau / 3.0;
    }
    const bracket = tau - B_tau - (a / 2.0) * B_tau * B_tau;
    return -(sig2 / (2.0 * a2)) * bracket;
  }

  /**
   * Sigma_P for European option on ZCB expiring at T with bond maturity S:
   * sigma_p = sigma / a * (1 - e^(-a*(S - T))) * sqrt((1 - e^(-2*a*T)) / (2*a))
   */
  public static computeOptionVolatility(
    a: number,
    sigma: number,
    optionMaturity: number,
    bondMaturity: number
  ): number {
    const tauOption = optionMaturity;
    const tauForward = bondMaturity - optionMaturity;
    const B_forward = this.computeB(a, tauForward);
    const varTerm = (1.0 - Math.exp(-2.0 * a * tauOption)) / (2.0 * a);
    return sigma * B_forward * Math.sqrt(Math.max(1e-12, varTerm));
  }
}
