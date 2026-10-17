/**
 * Wave 246: Gatheral & Schied (2013) Market Impact Decay Integral Equations Types
 * Strictly < 60 LOC, zero :any.
 */

export interface GatheralSchiedImpactConfig {
  decayKernelAlpha: number; // Power decay exponent alpha in G(t) = t^(-alpha) or exponential rho
  decayType: 'POWER_LAW' | 'EXPONENTIAL';
  exponentialDecayRho?: number;
  instantaneousImpactGamma: number;
}

export interface TradeSlice {
  timestamp: number;
  tradeSize: number; // Order execution slice size
}

export interface ImpactIntegralState {
  cumulativePriceImpact: number;
  instantaneousPriceShift: number;
  resilienceDecayRate: number;
}
