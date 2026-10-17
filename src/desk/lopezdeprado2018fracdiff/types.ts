/**
 * Wave 263: López de Prado (2018) Fractionally Differentiated Features Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface FracDiffConfig {
  readonly d: number; // Fractional differentiation degree (0.0 < d < 1.0)
  readonly threshold?: number; // Weight cutoff threshold tau, default 1e-4
  readonly maxLag?: number; // Maximum window length
}

export interface FracDiffWeightProfile {
  readonly d: number;
  readonly weights: readonly number[];
  readonly numWeights: number;
  readonly sumWeights: number;
}

export interface FracDiffResult {
  readonly differentiatedSeries: readonly number[];
  readonly originalLength: number;
  readonly validLength: number;
  readonly memoryRetentionCorrelation: number; // Pearson r between valid raw and fracdiff
  readonly weightProfile: FracDiffWeightProfile;
}
