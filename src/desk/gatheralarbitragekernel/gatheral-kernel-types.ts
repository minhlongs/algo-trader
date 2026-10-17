/**
 * Wave 242: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernel Types
 * Strictly < 60 LOC, zero :any.
 */

export type KernelType = 'POWER_LAW' | 'EXPONENTIAL' | 'STUDENT_T';

export interface TransientKernelConfig {
  kernelType: KernelType;
  gammaScale: number;
  decayRateAlpha: number;
  offsetC?: number;
}

export interface RoundTripStrategySchedule {
  tradeSteps: number[]; // e.g. [100, -100] or multi-step
  deltaT: number;
}

export interface DynamicArbitrageAssessment {
  roundTripTotalCost: number;
  isArbitrageFree: boolean;
  isCompletelyMonotone: boolean;
  peakTransientImpact: number;
}
