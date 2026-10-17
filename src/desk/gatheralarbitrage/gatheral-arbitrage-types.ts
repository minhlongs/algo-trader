/**
 * Wave 215: Gatheral (2010) No-Dynamic-Arbitrage Decay Kernel Types.
 *
 * Implements Gatheral's condition ruling out price manipulation in
 * non-linear transient impact models with decay kernels G(tau).
 * Strictly < 150 LOC, zero mocks, zero :any.
 */

export type KernelType = 'EXPONENTIAL' | 'POWER_LAW' | 'PERMANENT';

export interface GatheralArbitrageConfig {
  impactExponent: number;          // alpha in (0, 1], canonical 0.5 for square root
  impactMultiplier: number;        // c > 0
  kernelType: KernelType;          // Kernel form G(tau)
  decayParameter: number;          // rho > 0 (exponential) or gamma > 0 (power law)
  referencePrice?: number;         // S_0 (default: 100.0)
}

export interface RoundTripStrategy {
  shares: number;                  // Meta-order size X > 0
  horizonDays: number;             // Total duration T > 0
  oscillationCycles?: number;      // Number of buy-sell oscillation cycles (default: 1)
  intervals?: number;              // Time discretization steps N (default: 100)
}

export interface KernelEvaluationPoint {
  tauDays: number;
  decayWeight: number;
}

export interface GatheralArbitrageResult {
  impactExponentAlpha: number;
  kernelType: KernelType;
  decayParameter: number;
  roundTripCostBps: number;
  isDynamicArbitragePresent: boolean;
  theoreticalArbitrageFreeBound: number;
  status: 'NO_ARBITRAGE_COMPLIANT' | 'DYNAMIC_ARBITRAGE_DETECTED' | 'CRITICAL_BOUNDARY';
  diagnostics: {
    roundTripNetShortfallBps: number;
    peakPriceDistortionBps: number;
    decayHalfLifeDays: number;
  };
}
