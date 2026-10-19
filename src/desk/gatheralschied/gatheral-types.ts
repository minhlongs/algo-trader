export interface GatheralTransientConfig {
  decayScaleGamma: number;
  characteristicTimeTauSec: number;
  powerLawAlpha: number;
}

export interface TransientTrajectoryInput {
  orderQuantityQ: number;
  timeHorizonSecT: number;
  discreteStepsN: number;
}

export interface TransientImpactAssessment {
  initialKernelValue: number;
  terminalKernelValue: number;
  isCompletelyMonotone: boolean;
  totalIntegratedImpact: number;
  expectedExecutionCostEst: number;
}
