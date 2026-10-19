/**
 * Garman-Klass (1980) & Parkinson (1980) Extreme-Value Range Volatility Types
 */

export interface OHLCBar {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp?: number;
}

export interface RangeVolatilityEstimates {
  parkinsonVol: number; // Annualized Parkinson (1980) volatility
  garmanKlassVol: number; // Annualized Garman-Klass (1980) volatility
  classicalCloseToCloseVol: number; // Standard close-to-close historical volatility
  parkinsonEfficiencyRatio: number; // ~5.2x theoretical efficiency gain
  garmanKlassEfficiencyRatio: number; // ~7.4x theoretical efficiency gain
  sampleSize: number;
  annualizationFactor: number;
}

export interface RangeVolatilityConfig {
  annualizationFactor?: number; // e.g. 252 for daily, 365 for crypto
  minBars?: number;
}
