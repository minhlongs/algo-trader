/**
 * Bollerslev (1986) GARCH(1,1) & Glosten-Jagannathan-Runkle (1993) GJR-GARCH Types.
 * Seminal Papers:
 * - Tim Bollerslev (1986), Journal of Econometrics 31(3).
 * - Glosten, Jagannathan, Runkle (1993), Journal of Finance 48(5).
 * Strictly < 180 LOC, zero :any types.
 */

export type GarchModelType = 'STANDARD_GARCH' | 'GJR_GARCH';

export interface GarchParams {
  readonly omega: number; // constant base variance
  readonly alpha: number; // ARCH parameter (shock sensitivity)
  readonly beta: number; // GARCH parameter (persistence)
  readonly mu?: number; // conditional mean return
}

export interface GjrGarchParams extends GarchParams {
  readonly gamma: number; // asymmetry / leverage parameter
}

export interface GarchFitResult {
  readonly modelType: GarchModelType;
  readonly params: GjrGarchParams;
  readonly logLikelihood: number;
  readonly aic: number;
  readonly bic: number;
  readonly persistence: number;
  readonly unconditionalVariance: number;
  readonly annualizedLongRunVol: number;
  readonly isStationary: boolean;
  readonly conditionalVariances: readonly number[];
  readonly residuals: readonly number[];
}

export interface GarchForecastStep {
  readonly step: number;
  readonly variance: number;
  readonly volatility: number;
  readonly annualizedVol: number;
}

export interface GarchForecastResult {
  readonly modelType: GarchModelType;
  readonly horizon: number;
  readonly currentVariance: number;
  readonly longRunVariance: number;
  readonly steps: readonly GarchForecastStep[];
}
