/**
 * Epps (1979) High-Frequency Asynchronous Correlation Decay Types
 *
 * References:
 * Epps, T. W. (1979). Comovements in Stock Prices in the Very Short Run.
 * Journal of the American Statistical Association, 74(366a), 291-298.
 *
 * @module desk/eppseffect/epps-effect-types
 */

export interface TickRecord {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Trade price */
  price: number;
  /** Trade size / volume */
  volume?: number;
}

export interface EppsSamplingPoint {
  /** Sampling scale Delta t in milliseconds */
  samplingIntervalMs: number;
  /** Computed empirical Pearson correlation at this sampling frequency */
  correlation: number;
  /** Number of aligned return observations at this scale */
  sampleCount: number;
}

export interface EppsDecayCurve {
  /** Asymptotic macroscopic correlation rho_infinity */
  asymptoticCorrelation: number;
  /** Epps characteristic decay time scale tau_e in milliseconds */
  tauDecayMs: number;
  /** Curve fit root-mean-square error (RMSE) */
  fitRmse: number;
  /** Sampled empirical correlation points across Delta t */
  points: EppsSamplingPoint[];
}

export interface LeadLagEstimate {
  /** Estimated optimal lag offset in milliseconds (positive => asset A leads asset B) */
  optimalLagMs: number;
  /** Peak correlation observed at optimal lag */
  peakCorrelation: number;
  /** Correlation at contemporaneous zero-lag (Delta t = 0) */
  zeroLagCorrelation: number;
  /** Information asymmetry / lead-lag ratio: peak / contemporaneous */
  asymmetryRatio: number;
  /** Evaluated lag grid and associated cross-correlations */
  lagGrid: Array<{ lagMs: number; correlation: number }>;
}

export interface EppsAnalysisResult {
  assetA: string;
  assetB: string;
  decayCurve: EppsDecayCurve;
  leadLag: LeadLagEstimate;
  /** Whether Epps effect (decay toward zero at fine scales) is confirmed */
  isEppsEffectPresent: boolean;
}
