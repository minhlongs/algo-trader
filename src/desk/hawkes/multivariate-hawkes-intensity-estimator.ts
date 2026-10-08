import {
  HawkesEvent,
  HawkesKernelParams,
  HawkesIntensityEstimate,
} from './hawkes-types';

export class MultivariateHawkesIntensityEstimator {
  /**
   * Computes conditional intensity at target time t:
   * lambda(t) = mu + sum_{t_k < t} alpha * exp(-beta * (t - t_k))
   */
  public computeIntensity(
    currentTimeSeconds: number,
    history: HawkesEvent[],
    params: HawkesKernelParams
  ): HawkesIntensityEstimate {
    const { baselineIntensityMu, alphaExcitations, betaDecays } = params;

    let excitedIntensity = 0;

    for (const event of history) {
      const dt = currentTimeSeconds - event.timestampSeconds;
      if (dt > 0) {
        // Evaluate exponential kernel
        const alpha = alphaExcitations[0] ?? 0.5;
        const beta = betaDecays[0] ?? 2.0;
        excitedIntensity += alpha * Math.exp(-beta * dt);
      }
    }

    const totalIntensity = baselineIntensityMu + excitedIntensity;
    const exogenousShare = totalIntensity > 0 ? (baselineIntensityMu / totalIntensity) * 100.0 : 100.0;
    const endogenousShare = totalIntensity > 0 ? (excitedIntensity / totalIntensity) * 100.0 : 0.0;

    return {
      timestampSeconds: currentTimeSeconds,
      totalConditionalIntensity: Number(totalIntensity.toFixed(4)),
      exogenousSharePct: Number(exogenousShare.toFixed(2)),
      endogenousSharePct: Number(endogenousShare.toFixed(2)),
    };
  }
}
