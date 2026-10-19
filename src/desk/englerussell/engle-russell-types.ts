/**
 * Engle-Russell (1998) Autoregressive Conditional Duration (ACD) Model Types
 *
 * References:
 * Engle, R. F., & Russell, J. R. (1998). Autoregressive Conditional Duration:
 * A New Model for Irregularly Spaced Transaction Data.
 * Econometrica, 66(5), 1127-1162.
 *
 * @module desk/englerussell/engle-russell-types
 */

export type AcdDistribution = 'exponential' | 'weibull' | 'generalized-gamma';

export interface AcdModelConfig {
  /** AR duration order p (typically 1 or 2) */
  pOrder: number;
  /** Moving average duration order q (typically 1 or 2) */
  qOrder: number;
  /** Error innovation distribution assumption */
  distribution: AcdDistribution;
  /** Baseline baseline parameter omega > 0 */
  omega?: number;
  /** Auto-regressive coefficients alpha_i >= 0 (lagged past durations) */
  alpha?: number[];
  /** Moving average coefficients beta_j >= 0 (lagged conditional durations) */
  beta?: number[];
  /** Shape parameter gamma > 0 (for Weibull / Generalized Gamma) */
  shapeGamma?: number;
}

export interface TradeDurationEvent {
  /** Timestamp in milliseconds or seconds */
  timestamp: number;
  /** Duration elapsed since previous transaction */
  duration: number;
  /** Optional transaction volume */
  volume?: number;
  /** Optional trade price */
  price?: number;
}

export interface AcdFitResult {
  /** Intercept omega > 0 */
  omega: number;
  /** Alpha coefficients sum to persistence with beta */
  alpha: number[];
  /** Beta coefficients */
  beta: number[];
  /** Distribution shape parameter */
  shapeGamma?: number;
  /** Persistence = sum(alpha) + sum(beta) < 1 for stationarity */
  persistence: number;
  /** Unconditional expected duration = omega / (1 - persistence) */
  unconditionalMeanDuration: number;
  /** Log-likelihood value at optimum */
  logLikelihood: number;
  /** Akaike Information Criterion (AIC) */
  aic: number;
  /** Bayesian Information Criterion (BIC) */
  bic: number;
  /** Ljung-Box Q-statistic on standardized residuals */
  standardizedResidualsQStat: number;
  /** Number of observations fitted */
  sampleSize: number;
}

export interface AcdForecastResult {
  /** Forecast horizons 1..H */
  horizonSteps: number;
  /** Step-by-step conditional duration forecasts psi_{t+h} */
  forecastDurations: number[];
  /** Implied instantaneous trade arrival intensity lambda = 1 / psi */
  arrivalIntensity: number[];
  /** Microstructure trading speed regimes: 'rapid' | 'normal' | 'dormant' */
  speedRegime: 'rapid' | 'normal' | 'dormant';
}
