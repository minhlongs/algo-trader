/**
 * Wave 219: Lehalle & Neuman (2019) Order Flow Execution Engine.
 *
 * Coordinates real-time schedule rebalancing as market order flow arrives.
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

import {
  LehalleNeumanConfig,
  LehalleNeumanExecutionSchedule,
} from './lehalle-neuman-types';
import { LehalleNeumanMath } from './lehalle-neuman-math';

export class LehalleNeumanEngine {
  private readonly config: LehalleNeumanConfig;

  constructor(config: LehalleNeumanConfig) {
    this.config = config;
  }

  public generateSchedule(initialImbalance: number = 0.0, steps: number = 10): LehalleNeumanExecutionSchedule {
    return LehalleNeumanMath.computeExecutionSchedule(this.config, initialImbalance, steps);
  }

  public getTacticalSpeed(currentRemainingShares: number, currentImbalance: number, timeRemainingSec: number): number {
    const dynamicConfig: LehalleNeumanConfig = {
      ...this.config,
      totalSharesToExecute: currentRemainingShares,
      timeHorizonSec: timeRemainingSec,
    };
    const schedule = LehalleNeumanMath.computeExecutionSchedule(dynamicConfig, currentImbalance, 2);
    return schedule.trajectory[0]?.optimalSpeedSharesPerSec ?? 0;
  }
}
