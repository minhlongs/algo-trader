/**
 * High-Frequency Limit Order Book Hawkes Desk Types
 *
 * @module desk/hawkes/hawkes-types
 */

export type OrderBookEventType =
  | 'AGGRESSIVE_BUY'
  | 'AGGRESSIVE_SELL'
  | 'LIMIT_BID'
  | 'LIMIT_ASK'
  | 'CANCEL';

export interface HawkesEvent {
  readonly timestampSeconds: number;
  readonly eventType: OrderBookEventType;
  readonly size: number;
}

export interface HawkesKernelParams {
  readonly baselineIntensityMu: number; // Exogenous background rate
  readonly alphaExcitations: number[]; // Alpha interaction vector
  readonly betaDecays: number[]; // Exponential decay rates
}

export interface HawkesIntensityEstimate {
  readonly timestampSeconds: number;
  readonly totalConditionalIntensity: number; // lambda(t)
  readonly exogenousSharePct: number; // mu / lambda(t) * 100
  readonly endogenousSharePct: number; // self-excited share
}

export interface BranchingRatioAnalysis {
  readonly branchingMatrix: number[][]; // Gamma_ij = alpha_ij / beta_ij
  readonly spectralRadius: number; // Stability metric rho(Gamma)
  readonly isSystemStable: boolean; // rho < 1.0
  readonly reflexivityRegime: 'SUB_CRITICAL' | 'NEAR_CRITICAL' | 'SUPER_CRITICAL';
}
