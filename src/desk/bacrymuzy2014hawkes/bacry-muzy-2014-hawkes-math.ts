import { BacryMuzy2014HawkesInput, BacryMuzy2014HawkesOutput } from './types';

/**
 * Wave 334: Bacry, Mastromatteo & Muzy (2015) Hawkes Processes in Finance.
 * Computes spectral branching ratio n* = (alpha_self + alpha_cross) / beta
 * and instantaneous self-exciting intensity lambda(t).
 */
export class BacryMuzy2014Hawkes {
  public evaluate(input: BacryMuzy2014HawkesInput): BacryMuzy2014HawkesOutput {
    const mu = Math.max(1e-4, input.baselineIntensityPerSec);
    const alphaTotal = Math.max(0, input.selfExcitationAlpha + input.readonlycrossExcitationAlpha);
    const beta = Math.max(1e-4, input.exponentialDecayBeta);

    const branchingRatio = Number((alphaTotal / beta).toFixed(6));
    const stationaryMeanIntensity =
      branchingRatio < 0.999
        ? Number((mu / (1 - branchingRatio)).toFixed(6))
        : Number((mu * 1000).toFixed(6));

    const kernelSum = input.recentEventTimestampsSec.reduce((sum, ti) => {
      const dt = Math.max(0, input.currentTimeSec - ti);
      return sum + alphaTotal * Math.exp(-beta * dt);
    }, 0);

    const instantaneousIntensity = Number((mu + kernelSum).toFixed(6));
    const endogenousFraction = Number(
      Math.min(0.9999, branchingRatio).toFixed(6),
    );

    const criticalityState =
      branchingRatio >= 1.0
        ? 'SUPER_CRITICAL_EXPLOSIVE'
        : branchingRatio >= 0.8
          ? 'NEAR_CRITICAL_CLUSTER'
          : 'SUB_CRITICAL_STABLE';

    return {
      branchingRatio,
      stationaryMeanIntensity,
      instantaneousIntensity,
      endogenousFraction,
      criticalityState,
    };
  }
}
