/**
 * Daniel B. Nelson (1991) Exponential GARCH (EGARCH) Types.
 * Strictly < 180 LOC, zero :any types.
 */

export interface EgarchParams {
  readonly omega: number; // Constant in log-variance equation
  readonly alpha: number; // Magnitude of standardized innovation (|z| - E|z|)
  readonly gamma: number; // Asymmetric leverage coefficient (z)
  readonly beta: number;  // Persistence of log-variance
}

export interface EgarchPoint {
  readonly t: number;
  readonly returnVal: number;
  readonly condLogVar: number;
  readonly condVariance: number;
  readonly condVol: number;
  readonly standardizedResidual: number;
}

export interface EgarchFitResult {
  readonly params: EgarchParams;
  readonly logLikelihood: number;
  readonly aic: number;
  readonly bic: number;
  readonly persistence: number;
  readonly asymmetryIndex: number; // Equivalent to gamma
  readonly unconditionalVariance: number;
  readonly series: readonly EgarchPoint[];
}

export interface EgarchForecastPoint {
  readonly step: number;
  readonly condLogVar: number;
  readonly condVariance: number;
  readonly condVol: number;
}

export interface EgarchForecastResult {
  readonly horizon: number;
  readonly longRunVariance: number;
  readonly forecasts: readonly EgarchForecastPoint[];
}
