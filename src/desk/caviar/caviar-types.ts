/**
 * Type definitions for Engle & Manganelli (2004) CAViaR Engine.
 * Journal of Business & Economic Statistics, Vol. 22, No. 4, pp. 367-381.
 * Strictly < 150 LOC, zero `:any` types.
 */

export type CaviarSpecification = 'SAV' | 'AS' | 'ADAPTIVE';

export interface CaviarParameters {
  /** Constant intercept beta_1 */
  readonly beta1: number;
  /** Autoregressive persistence beta_2 */
  readonly beta2: number;
  /** Absolute/positive return sensitivity beta_3 */
  readonly beta3: number;
  /** Negative return leverage sensitivity beta_4 (only for AS specification) */
  readonly beta4?: number;
}

export interface DynamicQuantileTestResult {
  /** Empirical failure rate (proportion of hits) */
  readonly empiricalHitRate: number;
  /** Target quantile level theta (e.g. 0.05 or 0.01) */
  readonly targetQuantile: number;
  /** Total number of observations */
  readonly sampleSize: number;
  /** Total number of quantile violations */
  readonly hitCount: number;
  /** DQ Wald test statistic */
  readonly dqStatistic: number;
  /** Degrees of freedom for DQ test */
  readonly degreesOfFreedom: number;
  /** Kupiec POF unconditional coverage LR statistic */
  readonly kupiecLrStatistic: number;
  /** Whether the model passes unconditional coverage at 5% significance */
  readonly passesUnconditionalCoverage: boolean;
}

export interface CaviarForecastResult {
  readonly specification: CaviarSpecification;
  readonly quantileLevel: number;
  readonly parameters: CaviarParameters;
  readonly quantileSeries: readonly number[];
  readonly finalQuantile: number;
  readonly inSampleLoss: number;
  readonly dqTest: DynamicQuantileTestResult;
}
