/**
 * Research Agent API
 *
 * AI/LLM-friendly interface for the Alpha Discovery Engine.
 * This is the entry point for autonomous research agents.
 *
 * Available operations:
 * - runExperiment({ candles, config }) → ExperimentResult
 * - evaluateWalkForward({ candles, config }) → WalkForwardResult
 * - evaluate({ candles, trades, labels, steps, regimesPerBar }) → EvaluationReport
 * - evaluateAlpha({ candidate, candles, criteria? }) → AlphaVerdict
 * - runAllBaselines(candles, feeBps?, slippageBps?, seed?) → BaselineRun[]
 * - batchLabel(candles, tp, sl, maxHolding, startIdx?) → TripleBarrierResult[]
 * - classifyRegime(candles) → MarketRegime
 *
 * All operations are deterministic, causal, and return structured JSON.
 * No side effects — read-only research interface.
 */

import { runExperiment } from '../experiments/experiment-engine';
import { evaluateWalkForward } from '../walkforward/walkforward-evaluator';
import { evaluate } from '../evaluation/evaluation-engine';
import { evaluateAlpha } from '../attribution/alpha-evaluator';
import { runAllBaselines } from '../baselines/baseline-runner';
import { batchLabel } from '../labeling/triple-barrier';
import { classifyRegime } from '../regimes/regime-engine';

export {
  runExperiment,
  evaluateWalkForward,
  evaluate,
  evaluateAlpha,
  runAllBaselines,
  batchLabel,
  classifyRegime,
};

export type { CandleLike } from '../regimes/regime-types';
export type { ExperimentConfig } from '../experiments/experiment-types';
export type { ExperimentResult } from '../experiments/experiment-types';
export type { WalkForwardResult } from '../walkforward/walkforward-types';
export type { EvaluationReport } from '../evaluation/evaluation-types';
export type { BaselineRun } from '../baselines/baseline-runner';
export type { CandidateResult, SurvivalCriteria, AlphaVerdict } from '../attribution/alpha-evaluator';
