import type {
  GatheralSchied2013ExponentialInput,
  GatheralSchied2013ExponentialOutput,
} from './types';

export class GatheralSchied2013Exponential {
  /**
   * Gatheral & Schied (2013) / Alfonsi-Fruth-Schied Exponential Resilience LOB Execution:
   * Optimal strategy combines boundary block trades x_0 = x_T = X_0 / (2 + rho * T)
   * with constant intermediate rate xi = rho * X_0 / (2 + rho * T).
   */
  static evaluate(
    input: GatheralSchied2013ExponentialInput
  ): GatheralSchied2013ExponentialOutput {
    const X0 = input.initialInventorySharesX0;
    const rho = Math.max(1e-6, input.resilienceRateRhoPerSec);
    const T = Math.max(1e-3, input.horizonSecondsT);
    const K = Math.max(1e-6, input.bookDepthSharesPerTickK);

    const rhoT = rho * T;
    const denom = 2 + rhoT;
    const boundaryImpulseShares = X0 / denom;
    const continuousTradingRateSharesPerSec = (rho * X0) / denom;
    const continuousVolumeShareFraction = rhoT / denom;
    const expectedExecutionCostUsd = (X0 * X0) / (K * denom);

    const regime =
      continuousVolumeShareFraction >= 0.7
        ? 'CONTINUOUS_RESILIENT'
        : continuousVolumeShareFraction <= 0.3
          ? 'IMPULSE_DOMINATED'
          : 'BALANCED_BUCKET';

    return {
      boundaryImpulseShares: Number(boundaryImpulseShares.toFixed(6)),
      continuousTradingRateSharesPerSec: Number(
        continuousTradingRateSharesPerSec.toFixed(6)
      ),
      continuousVolumeShareFraction: Number(
        continuousVolumeShareFraction.toFixed(6)
      ),
      expectedExecutionCostUsd: Number(expectedExecutionCostUsd.toFixed(6)),
      regime,
    };
  }
}
