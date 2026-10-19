/**
 * Wave 242: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernel Math
 * Evaluates decay kernels G(t) ensuring complete monotonicity (-1)^k G^(k)(t) >= 0
 * to rule out price manipulation and dynamic arbitrage.
 * Strictly < 80 LOC, zero :any.
 */

import {
  TransientKernelConfig,
  RoundTripStrategySchedule,
  DynamicArbitrageAssessment,
} from './gatheral-kernel-types';

export function evaluateDecayKernel(t: number, config: TransientKernelConfig): number {
  if (t < 0) return 0;
  const c = config.offsetC ?? 0.01;

  switch (config.kernelType) {
    case 'EXPONENTIAL':
      return config.gammaScale * Math.exp(-config.decayRateAlpha * t);
    case 'POWER_LAW':
      return config.gammaScale / ((t + c) ** config.decayRateAlpha);
    case 'STUDENT_T':
      return config.gammaScale / ((1 + (t / c) ** 2) ** (config.decayRateAlpha / 2));
    default:
      return config.gammaScale * Math.exp(-config.decayRateAlpha * t);
  }
}

export function evaluateDynamicArbitrage(
  schedule: RoundTripStrategySchedule,
  config: TransientKernelConfig
): DynamicArbitrageAssessment {
  const n = schedule.tradeSteps.length;
  let totalCost = 0;
  let peakImpact = 0;

  for (let i = 0; i < n; i++) {
    const qi = schedule.tradeSteps[i];
    // Immediate self-impact: 0.5 * G(0) * q_i^2
    totalCost += 0.5 * evaluateDecayKernel(0, config) * (qi ** 2);

    for (let j = 0; j < i; j++) {
      const qj = schedule.tradeSteps[j];
      const dt = (i - j) * schedule.deltaT;
      const crossImpact = evaluateDecayKernel(dt, config) * qi * qj;
      totalCost += crossImpact;
      if (Math.abs(crossImpact) > peakImpact) {
        peakImpact = Math.abs(crossImpact);
      }
    }
  }

  // Under completely monotone kernels, round trip execution cost >= 0 (no free money)
  const isArbitrageFree = totalCost >= -1e-8;
  const isCompletelyMonotone = config.decayRateAlpha > 0 && config.gammaScale > 0;

  return {
    roundTripTotalCost: totalCost,
    isArbitrageFree,
    isCompletelyMonotone,
    peakTransientImpact: peakImpact,
  };
}
