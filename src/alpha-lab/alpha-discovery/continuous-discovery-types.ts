/**
 * Continuous Discovery Types
 *
 * Core data structures for autonomous strategy discovery, walkforward evaluation,
 * survival gates, and candidate diagnostics.
 *
 * Conforms 100% to the contract defined in PROJECT.md.
 */

import type { ExperimentConfig } from '../experiments/experiment-types';
import type { WalkForwardSummary, WalkForwardResult } from '../walkforward/walkforward-types';
import type { CandleLike } from '../regimes/regime-types';
import type { StrategyFamilyRegistry } from './strategy-family-types';
import type { PrioritizationPolicy } from './research-informed';
import type { VerdictSummary } from '../provenance/verdict-summary';
import type { ParamSweepOptions } from './candidate-generator';
import type { DataSourceProvenance } from '../provenance/run-card';
import type { AlphaSurvivalGateResult, AlphaSurvivalGateCriteria } from '../attribution/alpha-survival-gate';
import type { CandidateRejectionDiagnostic } from '../reports/candidate-rejection-diagnostics';

export type { AlphaSurvivalGateResult, AlphaSurvivalGateCriteria, CandidateRejectionDiagnostic };

/**
 * Discovered Alpha Candidate
 * Primary artifact passed from discovery pipeline to AISignalAdapter and provenance ledger.
 */
export interface DiscoveredAlphaCandidate {
  /** Unique strategy identifier (e.g. "momentum-breakout-btcusdt-1h-c0"). */
  strategyId: string;
  /** Strategy family identifier (e.g. "momentum-breakout"). */
  familyId: string;
  /** Explored parameter configuration values. */
  params?: Record<string, number>;
  /** Frozen experiment configuration. */
  config: ExperimentConfig;
  /** Full walkforward result with per-step breakdown. */
  walkforwardResult?: WalkForwardResult;
  /** Walkforward evaluation summary across all folds. */
  walkforwardSummary: WalkForwardSummary;
  /** Quantitative statistical survival gate evaluation result. */
  survivalGateResult: AlphaSurvivalGateResult;
  /** Candidate lifecycle status based on survival gates. */
  status: 'PASSED' | 'REJECTED';
  /** Structured rejection diagnostics (populated only when status is REJECTED). */
  rejectionDiagnostics?: CandidateRejectionDiagnostic[];
}

/**
 * Configuration options for the continuous discovery pipeline.
 */
export interface ContinuousDiscoveryPipelineConfig {
  /** Strategy family registry (defaults to default registry with 4 families). */
  registry?: StrategyFamilyRegistry;
  /** Market symbol to evaluate (default: 'BTC/USDT'). */
  symbol: string;
  /** Candle timeframe (default: '1h'). */
  timeframe: string;
  /** Number of candles to load if pre-loaded candles are not provided (default: 500). */
  candleCount?: number;
  /** Optional pre-loaded candle array. */
  candles?: CandleLike[];
  /** Optional data source provenance. */
  dataSource?: DataSourceProvenance[];
  /** Prioritization policy for strategy families (default: 'explore-first'). */
  prioritizationPolicy?: PrioritizationPolicy;
  /** Optional historical verdict summary for research-informed prioritization. */
  verdictSummary?: VerdictSummary;
  /** Optional list of family IDs to restrict evaluation to. */
  familyIds?: string[];
  /** Parameter sweep settings. */
  sweep?: ParamSweepOptions;
  /** Survival gate criteria overrides. */
  survivalGates?: Partial<AlphaSurvivalGateCriteria>;
}

/**
 * Summary statistics of a continuous discovery run cycle.
 */
export interface ContinuousDiscoverySummary {
  totalEvaluated: number;
  passedCount: number;
  rejectedCount: number;
  passRate: number;
  familiesEvaluated: string[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  dataSource: DataSourceProvenance[];
}

/**
 * Result returned by a continuous discovery cycle.
 */
export interface ContinuousDiscoveryResult {
  allCandidates: DiscoveredAlphaCandidate[];
  passedCandidates: DiscoveredAlphaCandidate[];
  rejectedCandidates: DiscoveredAlphaCandidate[];
  summary: ContinuousDiscoverySummary;
}
