/**
 * Wave 222: Bouchaud et al. (2004) Propagator Model of Stock Market Liquidity Math.
 *
 * Implements linear response propagator kernel convolution G(t - s).
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import type {
  PropagatorKernelConfig,
  TradeOrderFlowEvent,
  PropagatorImpactTrajectoryPoint,
} from './bouchaud-propagator-types';

export class BouchaudPropagatorMath {
  public static computeKernelValue(config: PropagatorKernelConfig, deltaTSec: number): number {
    const tau = Math.max(0.0, deltaTSec);
    const tau0 = Math.max(0.001, config.characteristicTimeScaleTau0Sec);
    const gamma = Math.min(0.5, Math.max(0.05, config.decayExponentGamma));
    const gamma0 = config.bareImpactGamma0;

    // G(tau) = Gamma_0 / (1 + tau / tau_0)^gamma
    const normalizedTime = 1.0 + (tau / tau0);
    return gamma0 / Math.pow(normalizedTime, gamma);
  }

  public static computeCumulativeImpact(
    config: PropagatorKernelConfig,
    events: TradeOrderFlowEvent[],
    evaluationTimesSec: number[]
  ): PropagatorImpactTrajectoryPoint[] {
    const alpha = config.volumePowerAlpha ?? 0.5;

    return evaluationTimesSec.map((evalTime) => {
      let cumulativePriceDrift = 0;
      let totalImbalance = 0;

      for (const ev of events) {
        if (ev.timestampSec <= evalTime) {
          const deltaT = evalTime - ev.timestampSec;
          const kernelG = this.computeKernelValue(config, deltaT);
          const volTerm = Math.pow(Math.max(1, ev.orderVolumeShares), alpha);
          cumulativePriceDrift += kernelG * ev.orderSign * volTerm;
          totalImbalance += ev.orderSign * ev.orderVolumeShares;
        }
      }

      const instantaneousDecay = this.computeKernelValue(config, 0.0);

      return {
        timeSec: Number(evalTime.toFixed(2)),
        cumulativeImpactPrice: Number(cumulativePriceDrift.toFixed(5)),
        instantaneousDecayFactor: Number(instantaneousDecay.toFixed(5)),
        orderFlowImbalance: totalImbalance,
      };
    });
  }
}
