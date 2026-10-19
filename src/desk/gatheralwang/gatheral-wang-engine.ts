/**
 * Gatheral & Wang (2012) Engine.
 */

import { GatheralWangConfig, GatheralWangSchedule } from './gatheral-wang-types';
import { computeOptimalGatheralWangTrajectory } from './gatheral-wang-math';

export class GatheralWangEngine {
  constructor(private readonly config: GatheralWangConfig) {}

  public getSchedule(): GatheralWangSchedule {
    return computeOptimalGatheralWangTrajectory(this.config);
  }

  public getRemainingSharesAt(timeSec: number): number {
    const sched = this.getSchedule();
    if (timeSec <= 0) return this.config.totalSharesX0;
    if (timeSec >= this.config.horizonSecT) return 0;

    const afterT0 = this.config.totalSharesX0 - sched.initialBlockTradeShares;
    const tradedContinuous = sched.continuousTradingRatePerSec * timeSec;
    return Math.max(sched.terminalBlockTradeShares, afterT0 - tradedContinuous);
  }
}
