/**
 * Gatheral, Schied & Slynko (2012) Transient Market Impact Mathematics.
 * G(t) = gamma / (1 + t / tau)^alpha
 */
import { GatheralTransientConfig, TransientTrajectoryInput, TransientImpactAssessment } from './gatheral-types';

export function evaluateTransientKernel(tSec: number, config: GatheralTransientConfig): number {
  if (tSec < 0) return 0;
  const scaled = 1 + tSec / config.characteristicTimeTauSec;
  return config.decayScaleGamma / Math.pow(scaled, config.powerLawAlpha);
}

export function assessTransientTrajectory(
  input: TransientTrajectoryInput,
  config: GatheralTransientConfig
): TransientImpactAssessment {
  const g0 = evaluateTransientKernel(0, config);
  const gT = evaluateTransientKernel(input.timeHorizonSecT, config);
  const isMonotone = config.decayScaleGamma > 0 && config.characteristicTimeTauSec > 0 && config.powerLawAlpha > 0;

  const dt = input.timeHorizonSecT / input.discreteStepsN;
  const tradeRate = input.orderQuantityQ / input.timeHorizonSecT;

  let integratedKernel = 0;
  for (let i = 0; i < input.discreteStepsN; i++) {
    const t = (i + 0.5) * dt;
    integratedKernel += evaluateTransientKernel(t, config) * dt;
  }

  // Cost approx: Integral of tradeRate * Impact(t)
  const cost = 0.5 * tradeRate * input.orderQuantityQ * integratedKernel;

  return {
    initialKernelValue: g0,
    terminalKernelValue: gT,
    isCompletelyMonotone: isMonotone,
    totalIntegratedImpact: integratedKernel,
    expectedExecutionCostEst: cost,
  };
}
