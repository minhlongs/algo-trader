import { KyleBackParams } from './kyle-back-types';

export class KyleBackDynamics {
  /**
   * Kyle (1985) / Back (1992) equilibrium market depth parameter (Kyle's lambda):
   * lambda = sqrt(Sigma_0) / (sigma_u * sqrt(T))
   */
  public static calculateTheoreticalLambda(params: KyleBackParams): number {
    if (
      params.priorVariance <= 0 ||
      params.noiseTraderSigma <= 0 ||
      params.timeHorizonYears <= 0
    ) {
      throw new Error(
        'Prior variance, noise trader sigma, and time horizon must be strictly positive'
      );
    }

    return (
      Math.sqrt(params.priorVariance) /
      (params.noiseTraderSigma * Math.sqrt(params.timeHorizonYears))
    );
  }

  /**
   * Residual uncertainty / variance of asset value at time t:
   * Sigma(t) = Sigma_0 * (1 - t / T)
   */
  public static calculateResidualVariance(
    priorVariance: number,
    t: number,
    T: number
  ): number {
    if (t >= T) return 0.0;
    return priorVariance * (1.0 - t / T);
  }

  /**
   * Optimal trading intensity beta(t) for the informed trader:
   * beta(t) = sigma_u / sqrt(Sigma_0 * (T - t))
   */
  public static calculateTradingIntensity(
    params: KyleBackParams,
    t: number
  ): number {
    const remainingTime = params.timeHorizonYears - t;
    if (remainingTime <= 1e-6) {
      // Near boundary T, trading intensity approaches high intensity
      return params.noiseTraderSigma / Math.sqrt(params.priorVariance * 1e-6);
    }

    return (
      params.noiseTraderSigma /
      Math.sqrt(params.priorVariance * remainingTime)
    );
  }
}
