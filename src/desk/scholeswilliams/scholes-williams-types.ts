/**
 * Scholes-Williams (1977) Non-Synchronous Trading Beta Types
 *
 * References:
 * Scholes, M., & Williams, J. (1977). Estimating betas from nonsynchronous data.
 * Journal of Financial Economics, 5(3), 309-327.
 *
 * @module desk/scholeswilliams/scholes-williams-types
 */

export interface ReturnSeriesPair {
  /** Asset return vector */
  assetReturns: number[];
  /** Market index benchmark return vector */
  marketReturns: number[];
  /** Optional timestamps */
  timestamps?: number[];
}

export interface LagBetaEstimates {
  /** OLS beta against lagged market returns (lag -1): Cov(Ri, Rm_{t-1}) / Var(Rm) */
  betaLagMinus1: number;
  /** Standard contemporaneous OLS beta (lag 0): Cov(Ri, Rm_t) / Var(Rm) */
  betaLag0: number;
  /** OLS beta against lead market returns (lag +1): Cov(Ri, Rm_{t+1}) / Var(Rm) */
  betaLagPlus1: number;
}

export interface ScholesWilliamsBetaResult {
  /** Asymptotically unbiased Scholes-Williams beta estimator */
  betaScholesWilliams: number;
  /** Conventional OLS contemporaneous beta */
  betaOls: number;
  /** Percentage bias of standard OLS: (betaOls - betaSW) / betaSW */
  biasOlsPct: number;
  /** Market index first-order autocorrelation rho_m */
  marketAutocorrelation: number;
  /** Multi-lag beta components */
  lagBetas: LagBetaEstimates;
  /** Standard error of the Scholes-Williams estimator */
  standardError: number;
  /** Two-tailed t-statistic for H0: beta = 1 */
  tStatisticBeta1: number;
  /** Price discovery score: (beta_+1 - beta_-1) / (|beta_0| + eps) */
  priceDiscoveryScore: number;
  /** Number of synchronized observations used */
  sampleSize: number;
}
