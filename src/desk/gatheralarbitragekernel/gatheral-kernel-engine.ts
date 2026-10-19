/**
 * Wave 242: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernel Engine
 * Strictly < 50 LOC, zero :any.
 */

import {
  TransientKernelConfig,
  RoundTripStrategySchedule,
  DynamicArbitrageAssessment,
} from './gatheral-kernel-types';
import { evaluateDynamicArbitrage, evaluateDecayKernel } from './gatheral-kernel-math';

export class GatheralArbitrageKernelEngine {
  private readonly config: TransientKernelConfig;

  constructor(config: TransientKernelConfig) {
    if (config.gammaScale < 0) {
      throw new Error('gammaScale must be non-negative');
    }
    this.config = config;
  }

  public getKernelValue(timeT: number): number {
    return evaluateDecayKernel(timeT, this.config);
  }

  public testArbitrageFreeStrategy(schedule: RoundTripStrategySchedule): DynamicArbitrageAssessment {
    return evaluateDynamicArbitrage(schedule, this.config);
  }
}
