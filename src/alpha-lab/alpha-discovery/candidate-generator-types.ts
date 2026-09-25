/**
 * Candidate Generator Types
 */

import type { ExperimentConfig } from '../experiments/experiment-types';
import type { PrioritizationPolicy } from './research-informed';
import type { VerdictSummary } from '../provenance/verdict-summary';

export interface ParamSweepOptions {
  mode?: 'defaults' | 'grid' | 'random';
  maxCandidatesPerFamily?: number; // default: 5
  stepsPerParam?: number;          // default: 3 (for grid mode)
  seed?: number;                   // default: 42
}

export interface CandidateAlphaConfig {
  candidateId: string;
  familyId: string;
  symbol: string;
  timeframe: string;
  params: Record<string, number>;
  experimentConfig: ExperimentConfig;
}

export interface GenerateCandidatesOptions extends ParamSweepOptions {
  symbol: string;
  timeframe: string;
  familyIds?: string[];
  policy?: PrioritizationPolicy;
  verdictSummary?: VerdictSummary;
  costOverrides?: { feeBps?: number; slippageBps?: number };
}
