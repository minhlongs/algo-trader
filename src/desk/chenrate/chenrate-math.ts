export class ChenRateMath {
  /**
   * Evaluates expected central tendency theta_t at time t:
   * E[theta_t] = theta_bar + (theta_0 - theta_bar) * exp(-alpha * t)
   */
  public static expectedMean(theta0: number, thetaBar: number, alpha: number, t: number): number {
    return thetaBar + (theta0 - thetaBar) * Math.exp(-alpha * t);
  }

  /**
   * Evaluates expected short-rate variance sigma_t at time t:
   * E[sigma_t] = sigma_bar + (sigma_0 - sigma_bar) * exp(-beta * t)
   */
  public static expectedVariance(sigma0: number, sigmaBar: number, beta: number, t: number): number {
    return sigmaBar + (sigma0 - sigmaBar) * Math.exp(-beta * t);
  }

  /**
   * Integrates expected rate E[r_t] conditional on initial state:
   * r_t = r_0 * exp(-k * t) + k * integral_0^t theta_s * exp(-k * (t - s)) ds
   */
  public static expectedRate(
    r0: number,
    theta0: number,
    thetaBar: number,
    k: number,
    alpha: number,
    t: number
  ): number {
    const termR = r0 * Math.exp(-k * t);
    const termBar = thetaBar * (1.0 - Math.exp(-k * t));

    let termTransient = 0;
    if (Math.abs(k - alpha) > 1e-6) {
      termTransient =
        ((k * (theta0 - thetaBar)) / (k - alpha)) * (Math.exp(-alpha * t) - Math.exp(-k * t));
    } else {
      termTransient = k * (theta0 - thetaBar) * t * Math.exp(-k * t);
    }

    return termR + termBar + termTransient;
  }
}
