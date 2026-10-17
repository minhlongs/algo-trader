/**
 * Wave 222: Bouchaud et al. (2004) Propagator Model of Stock Market Liquidity Engine.
 *
 * Exposes propagator-based price impact simulator and transient response estimator.
 * Strictly < 100 LOC, zero mocks, zero :any.
 */

import type {
  PropagatorKernelConfig,
  TradeOrderFlowEvent,
  PropagatorImpactTrajectoryPoint,
} from './bouchaud-propagator-types';
import { BouchaudPropagatorMath } from './bouchaud-propagator-math';

export class BouchaudPropagatorEngine {
  constructor(private readonly config: PropagatorKernelConfig) {}

  public getKernelAtLag(lagSec: number): number {
    return Number(BouchaudPropagatorMath.computeKernelValue(this.config, lagSec).toFixed(6));
  }

  public simulateImpactTrajectory(
    events: TradeOrderFlowEvent[],
    evaluationTimes: number[]
  ): PropagatorImpactTrajectoryPoint[] {
    return BouchaudPropagatorMath.computeCumulativeImpact(this.config, events, evaluationTimes);
  }

  public estimatePermanentResidualImpactFraction(horizonSec: number): number {
    const immediate = BouchaudPropagatorMath.computeKernelValue(this.config, 0.0);
    const decayed = BouchaudPropagatorMath.computeKernelValue(this.config, horizonSec);
    return Number((decayed / Math.max(1e-6, immediate)).toFixed(4));
  }
}
