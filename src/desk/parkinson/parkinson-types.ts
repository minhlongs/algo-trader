/**
 * Parkinson (1980) Extreme Value High-Low Volatility Estimator Types
 * Reference: Parkinson, M. (1980). "The Extreme Value Method for Estimating
 * the Variance of the Rate of Return." The Journal of Business, 53(1), 61-65.
 */

export interface ParkinsonBar {
  high: number;
  low: number;
  close?: number;
  timestamp?: number;
}

export interface ParkinsonConfig {
  /** Trading periods per year for annualization (default: 252 for equities/FX, 365 for crypto) */
  annualizationFactor?: number;
  /** Minimum number of bars required (default: 2) */
  minBars?: number;
}

export interface ParkinsonEstimates {
  /** Parkinson annualized volatility (sigma_P) */
  parkinsonVol: number;
  /** Parkinson daily/periodic variance */
  parkinsonVariance: number;
  /** Theoretical efficiency ratio relative to classical close-to-close estimator (~5.2x) */
  efficiencyGain: number;
  /** Number of bars used in estimation */
  sampleSize: number;
  /** Annualization factor applied */
  annualizationFactor: number;
}
