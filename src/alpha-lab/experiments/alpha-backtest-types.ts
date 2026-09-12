/**
 * Alpha Backtest Types
 *
 * Type definitions for alpha experiment configuration and run results.
 */

import type { RegimeSnapshot } from '../regimes/regime-types';
import type { FeatureVector } from '../features/feature-types';
import type { TripleBarrierResult } from '../labeling/triple-barrier';

export interface AlphaExperimentConfig {
  market: string;
  timeframe: string;
  lookback: number;
  features: string[];
  tp: number;
  sl: number;
  maxHolding: number;
  regimes?: 'all' | string[];
}

export interface AlphaRunResult {
  regimeSnapshots: RegimeSnapshot[];
  featureVectors: FeatureVector[];
  labels: Array<TripleBarrierResult & { entryIdx: number }>;
}
