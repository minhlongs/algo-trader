/**
 * Wave 235: Gatheral (2010) Engine
 */

import { ManipulationKernelConfig, RoundTripSchedule, ManipulationAssessment } from './gatheral-types';
import { evaluateKernel, computeQuadraticExecutionCost } from './gatheral-math';

export class GatheralManipulationEngine {
  constructor(private readonly config: ManipulationKernelConfig) {}

  public getKernel(t: number): number {
    return evaluateKernel(t, this.config);
  }

  public assessRoundTrip(schedule: RoundTripSchedule): ManipulationAssessment {
    return computeQuadraticExecutionCost(schedule, this.config);
  }
}
