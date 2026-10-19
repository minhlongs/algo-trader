/**
 * Wave 252: Bouchaud, Farmer & Lillo (2009) Order Flow Fluctuation Dissipation Types.
 *
 * Implements response function decomposition R(l) and bare impact kernel Gamma(l)
 * inverted from signed order flow autocorrelation C(l) via Wiener-Hopf equation.
 *
 * Strictly < 80 LOC, zero `:any` types.
 */

export interface AutocorrelationLagPoint {
  readonly lagL: number;
  readonly orderSignAutocorrelationC: number;
  readonly observedResponseR: number;
}

export interface BouchaudFluctuationConfig {
  readonly memoryDecayGamma: number; // long memory exponent 0 < gamma < 1
  readonly baselineBareImpactG0: number; // instantaneous bare impact
  readonly lagPoints: readonly AutocorrelationLagPoint[];
}

export interface FluctuationDissipationState {
  readonly bareImpactKernelGamma: readonly number[];
  readonly totalDissipatedEnergy: number;
  readonly subdiffusiveDiffusivityD: number;
  readonly isPermanentArbitrageFree: boolean;
}
