export class KyleAuctionMath {
  /**
   * Equilibrium pricing rule & trading aggressiveness for single batch auction:
   * lambda = sqrt(Sigma_0) / (2 * sigma_u)
   * beta = sigma_u / sqrt(Sigma_0)
   */
  public static calculateSinglePeriodEquilibrium(
    priorVariance: number,
    noiseVariance: number
  ): { lambda: number; beta: number } {
    const sigmaU = Math.sqrt(noiseVariance);
    const sqrtSigma0 = Math.sqrt(priorVariance);
    const lambda = sqrtSigma0 / (2 * sigmaU);
    const beta = sigmaU / sqrtSigma0;
    return { lambda, beta };
  }

  /**
   * Posterior variance update following order flow omega = x + u:
   * Sigma_1 = Sigma_0 * (1 - beta * lambda) = 0.5 * Sigma_0
   */
  public static updatePosteriorVariance(
    priorVariance: number,
    beta: number,
    lambda: number
  ): number {
    return priorVariance * (1.0 - beta * lambda);
  }

  /**
   * Equilibrium pricing function:
   * P(omega) = p_0 + lambda * omega
   */
  public static calculateClearingPrice(
    priorMean: number,
    lambda: number,
    totalOrderFlow: number
  ): number {
    return priorMean + lambda * totalOrderFlow;
  }
}
