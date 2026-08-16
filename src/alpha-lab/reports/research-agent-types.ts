/**
 * Research Agent API Types
 *
 * Re-exports from across alpha-lab for AI agent consumption.
 */

export type { ExperimentConfig } from '../experiments/experiment-types';
export type { CandleLike } from '../regimes/regime-types';
export type { TripleBarrierResult } from '../labeling/triple-barrier';
export type {
  BaselineRun,
  BaselineCostConfig,
  BaselineResult,
  BuyHoldConfig,
  RandomEntryConfig,
  MomentumConfig,
  MeanReversionConfig,
} from '../baselines/baseline-types';
export type {
  SurvivalCriteria,
  CandidateResult,
  BaselineComparison,
  AlphaVerdict,
} from '../attribution/alpha-evaluator';