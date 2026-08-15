/**
 * Meta-Learner types and default configuration.
 */

export interface MetaWeight {
  name: string;
  weight: number;
  /** Wilson score 95% confidence interval [lower, upper] */
  ci: [number, number];
  sampleSize: number;
  /** EMA win-rate (0-1) */
  winRate: number;
}

export interface MetaLearnerConfig {
  emaDecay: number;       // 0-1; 0.9 = slow adaptation, 0.5 = fast
  minSamples: number;     // minimum resolved predictions before using EMA
  fallbackWeight: number; // weight assigned to unknown strategies
  maxWeight: number;      // cap on normalised weight
  minWeight: number;      // floor on normalised weight
  lookback: number;       // max recent predictions to consider
  ciAlpha: number;        // confidence level (default 0.05 = 95% CI)
}

export const DEFAULT_META_LEARNER_CONFIG: MetaLearnerConfig = {
  emaDecay: 0.85,
  minSamples: 5,
  fallbackWeight: 0.33,
  maxWeight: 2.0,
  minWeight: 0.05,
  lookback: 100,
  ciAlpha: 0.05,
};

export interface StoredPrediction {
  id: string;
  marketId: string;
  title: string;
  predictedOutcome: 'YES' | 'NO';
  confidence: number;
  predictedAt: number;
  marketYesPrice: number;
  strategy: string;
  actualOutcome: 'YES' | 'NO' | null;
  resolvedAt: number | null;
  correct: boolean | null;
}

export interface EmaCacheEntry {
  winRate: number;
  sampleSize: number;
  ci: [number, number];
}
