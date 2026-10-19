import { GatheralTransientConfig, TransientTrajectoryInput, TransientImpactAssessment } from './gatheral-types';
import { evaluateTransientKernel, assessTransientTrajectory } from './gatheral-math';

export class GatheralSchiedEngine {
  constructor(private readonly config: GatheralTransientConfig) {}

  public getKernel(tSec: number): number {
    return evaluateTransientKernel(tSec, this.config);
  }

  public evaluate(input: TransientTrajectoryInput): TransientImpactAssessment {
    return assessTransientTrajectory(input, this.config);
  }
}
