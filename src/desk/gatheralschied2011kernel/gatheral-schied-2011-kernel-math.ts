import {
  GatheralSchied2011KernelConfig,
  GatheralExecutionSchedule,
  EnergyVerificationResult,
} from './types';

/**
 * Wave 261: Gatheral, Schied & Slynko (2011) Exponential Transient Kernel Math.
 * Strictly < 85 LOC, zero :any.
 */
export function evaluateKernel(tau: number, g0: number, beta: number): number {
  return g0 * Math.exp(-beta * Math.abs(tau));
}

export function computeOptimalGatheralSchedule(
  config: GatheralSchied2011KernelConfig
): GatheralExecutionSchedule {
  const { initialSharesX0, executionHorizonT, kernelScaleG0, kernelDecayBeta } = config;
  const n = Math.max(1, config.discretizationStepsN ?? 10);
  const dt = executionHorizonT / n;
  const denom = kernelDecayBeta * executionHorizonT + 2;

  const initialImpulseV0 = initialSharesX0 / denom;
  const finalImpulseVN = initialSharesX0 / denom;
  const intermediateRate = (kernelDecayBeta * initialSharesX0) / denom;
  const intermediateStepSize = intermediateRate * dt;

  const times: number[] = [];
  const trades: number[] = [];
  const impact: number[] = [];

  for (let k = 0; k <= n; k++) {
    times.push(k * dt);
    let trade = 0;
    if (k === 0) trade += initialImpulseV0;
    if (k > 0) trade += intermediateStepSize;
    if (k === n) trade += finalImpulseVN;
    trades.push(trade);
  }

  for (let k = 0; k <= n; k++) {
    let acc = 0;
    for (let j = 0; j <= k; j++) {
      acc += evaluateKernel(times[k] - times[j], kernelScaleG0, kernelDecayBeta) * trades[j];
    }
    impact.push(acc);
  }

  const totalLiquidatedShares = trades.reduce((sum, v) => sum + v, 0);

  return {
    initialImpulseV0,
    finalImpulseVN,
    intermediateRate,
    totalLiquidatedShares,
    discreteTradeSizes: trades,
    discreteTimePoints: times,
    impactAccumulator: impact,
  };
}

export function verifyPositiveEnergy(
  trades: readonly number[],
  times: readonly number[],
  g0: number,
  beta: number
): EnergyVerificationResult {
  let energy = 0;
  const m = trades.length;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      energy += trades[i] * evaluateKernel(times[i] - times[j], g0, beta) * trades[j];
    }
  }

  const isPositiveEnergy = energy > 1e-12;
  return {
    quadraticEnergy: energy,
    isPositiveEnergy,
    priceManipulationFree: isPositiveEnergy,
  };
}
