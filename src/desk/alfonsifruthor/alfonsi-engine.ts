import { AlfonsiBookConfig, AlfonsiExecutionStep, AlfonsiExecutionAssessment } from './alfonsi-types';
import { computePriceImpactFromDepth, simulateAlfonsiStep } from './alfonsi-math';

export class AlfonsiFruthEngine {
  constructor(private readonly config: AlfonsiBookConfig) {}

  public getPriceImpact(depth: number): number {
    return computePriceImpactFromDepth(depth, this.config);
  }

  public step(priorDepth: number, step: AlfonsiExecutionStep): AlfonsiExecutionAssessment {
    return simulateAlfonsiStep(priorDepth, step, this.config);
  }
}
