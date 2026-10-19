/**
 * Wave 247: Kyle, Obizhaeva & Wang (2020) - Smooth Market Impact with Market Resiliency.
 *
 * Models continuous smooth market impact with exponential decay kernel:
 * I(t) = lambda * int_0^t v(s) * exp(-rho * (t - s)) ds
 * and terminal permanent impact component:
 * I_perm(t) = mu * Q_total
 *
 * Strictly zero mocks, pure math, < 90 LOC, zero :any types.
 */

export interface KyleObizhaevaSmoothConfig {
  transientLambda: number; // Transient price impact coefficient
  permanentMu: number; // Permanent price impact coefficient
  resiliencyRho: number; // Speed of market resiliency mean reversion (1/sec)
}

export interface ExecutionRateSlice {
  timestamp: number; // Seconds
  rateV: number; // Trading rate (shares/sec or contracts/sec)
  duration: number; // Duration of slice in seconds
}

export interface SmoothImpactState {
  currentTransientImpact: number;
  cumulativePermanentImpact: number;
  totalMarketImpact: number;
  resiliencyHalfLifeSec: number;
}

export function computeKyleObizhaevaSmoothImpact(
  slices: ExecutionRateSlice[],
  observationTime: number,
  config: KyleObizhaevaSmoothConfig
): SmoothImpactState {
  let transientImpact = 0;
  let totalTradedVolume = 0;

  for (const slice of slices) {
    if (slice.timestamp <= observationTime) {
      const sliceEnd = Math.min(slice.timestamp + slice.duration, observationTime);
      const activeDuration = Math.max(0, sliceEnd - slice.timestamp);
      totalTradedVolume += slice.rateV * activeDuration;

      // Analytical integration of v * exp(-rho * (t - s)) ds over [t_start, t_end]
      // = (v / rho) * (exp(-rho * (t - t_end)) - exp(-rho * (t - t_start)))
      if (activeDuration > 0 && config.resiliencyRho > 0) {
        const dtEnd = observationTime - sliceEnd;
        const dtStart = observationTime - slice.timestamp;
        const integratedDecay =
          (slice.rateV / config.resiliencyRho) *
          (Math.exp(-config.resiliencyRho * dtEnd) - Math.exp(-config.resiliencyRho * dtStart));
        transientImpact += config.transientLambda * integratedDecay;
      }
    }
  }

  const permanentImpact = config.permanentMu * totalTradedVolume;
  const halfLife = config.resiliencyRho > 0 ? Math.LN2 / config.resiliencyRho : Infinity;

  return {
    currentTransientImpact: transientImpact,
    cumulativePermanentImpact: permanentImpact,
    totalMarketImpact: transientImpact + permanentImpact,
    resiliencyHalfLifeSec: halfLife,
  };
}
