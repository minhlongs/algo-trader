/**
 * Rogers-Satchell (1991) Range Volatility Types
 */

export interface RogersSatchellBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface RogersSatchellConfig {
  /** Annualization multiplier, e.g. 252 (daily), 365 (crypto), 252*24*60 (minute) */
  annualizationFactor?: number;
  /** Minimum number of bars required to compute estimates (default: 2) */
  minBars?: number;
}

export interface RogersSatchellEstimates {
  /** Rogers-Satchell annualized volatility */
  rogersSatchellVol: number;
  /** Classical close-to-close annualized volatility */
  classicalCloseToCloseVol: number;
  /** Statistical efficiency gain vs close-to-close */
  efficiencyRatio: number;
  /** Total number of bars analyzed */
  sampleSize: number;
  /** Annualization factor applied */
  annualizationFactor: number;
}
