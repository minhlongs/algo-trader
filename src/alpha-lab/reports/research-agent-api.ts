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

import {
  runExperiment,
  evaluateWalkForward,
  evaluate,
  evaluateAlpha,
  runAllBaselines,
  batchLabel,
  classifyRegime,
} from '../attribution/alpha-evaluator';

export {
  runExperiment,
  evaluateWalkForward,
  evaluate,
  evaluateAlpha,
  runAllBaselines,
  batchLabel,
  classifyRegime,
};

export type {
  CandleLike,
  ExperimentConfig,
  ExperimentResult,
  WalkForwardResult,
  EvaluationReport,
  BaselineRun,
  CandidateResult,
} from '../attribution/alpha-evaluator';