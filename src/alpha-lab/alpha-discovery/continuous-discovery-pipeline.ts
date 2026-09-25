/**
 * Continuous Discovery Pipeline
 *
 * Autonomous strategy discovery pipeline orchestrating:
 * 1. Historical market data ingestion & causal regime series tagging
 * 2. Research-informed strategy family prioritization
 * 3. Bounded parameter sweeps across strategy families
 * 4. Causal walkforward out-of-sample evaluation
 * 5. Quantitative statistical survival gates & transaction cost stress testing
 * 6. Structured rejection diagnostics & refinement hypothesis generation
 * 7. Packaging into DiscoveredAlphaCandidate contracts
 */

import { createDefaultRegistry } from './strategy-family-registry';
import { generateAllCandidateConfigs, type CandidateAlphaConfig } from './candidate-generator';
import { loadCandles, buildDataSources } from '../experiments/alpha-backtest-candles';
import { evaluateWalkForward } from '../walkforward/walkforward-evaluator';
import { evaluateAlphaSurvivalGate } from '../attribution/alpha-survival-gate';
import { generateCandidateRejectionDiagnostics } from '../reports/candidate-rejection-diagnostics';
import { logger } from '../../shared/utils/logger';
import type { CandleLike } from '../regimes/regime-types';
import type {
  ContinuousDiscoveryPipelineConfig,
  ContinuousDiscoveryResult,
  DiscoveredAlphaCandidate,
  ContinuousDiscoverySummary,
} from './continuous-discovery-types';

export * from './continuous-discovery-types';


export class ContinuousDiscoveryPipeline {
  private config: ContinuousDiscoveryPipelineConfig;

  constructor(config?: Partial<ContinuousDiscoveryPipelineConfig>) {
    this.config = {
      registry: config?.registry ?? createDefaultRegistry(),
      symbol: config?.symbol ?? 'BTC/USDT',
      timeframe: config?.timeframe ?? '1h',
      candleCount: config?.candleCount ?? 500,
      prioritizationPolicy: config?.prioritizationPolicy ?? 'explore-first',
      sweep: {
        mode: config?.sweep?.mode ?? 'defaults',
        maxCandidatesPerFamily: config?.sweep?.maxCandidatesPerFamily ?? 5,
        stepsPerParam: config?.sweep?.stepsPerParam ?? 3,
        seed: config?.sweep?.seed ?? 42,
      },
      survivalGates: config?.survivalGates,
      candles: config?.candles,
      dataSource: config?.dataSource,
      verdictSummary: config?.verdictSummary,
      familyIds: config?.familyIds,
    };
  }

  /**
   * Set or update pre-loaded candles for evaluation.
   */
  public setCandles(candles: CandleLike[]): void {
    this.config.candles = candles;
  }

  /**
   * Run one full autonomous discovery cycle.
   */
  async runCycle(): Promise<ContinuousDiscoveryResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Prepare Market Data
    let candles: CandleLike[];
    let dataSources = this.config.dataSource;

    if (this.config.candles && this.config.candles.length > 0) {
      candles = this.config.candles;
      dataSources = dataSources ?? buildDataSources(this.config.symbol, this.config.timeframe, candles, 'real');
    } else {
      const loaded = await loadCandles(this.config.symbol, this.config.timeframe, this.config.candleCount ?? 500);
      candles = loaded.candles;
      dataSources = buildDataSources(this.config.symbol, this.config.timeframe, candles, loaded.source);
    }

    logger.info('ContinuousDiscoveryPipeline: Prepared candles', {
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      count: candles.length,
    });

    // 2. Generate Prioritized Candidate Configurations Across Families
    const registry = this.config.registry ?? createDefaultRegistry();
    const candidateConfigs = generateAllCandidateConfigs(registry, {
      symbol: this.config.symbol,
      timeframe: this.config.timeframe,
      familyIds: this.config.familyIds,
      policy: this.config.prioritizationPolicy,
      verdictSummary: this.config.verdictSummary,
      mode: this.config.sweep?.mode ?? 'defaults',
      maxCandidatesPerFamily: this.config.sweep?.maxCandidatesPerFamily ?? 5,
      stepsPerParam: this.config.sweep?.stepsPerParam ?? 3,
      seed: this.config.sweep?.seed ?? 42,
    });

    // 3. Evaluate Each Candidate Through Walkforward & Survival Gates
    const evaluatedCandidates: DiscoveredAlphaCandidate[] = [];

    for (const cand of candidateConfigs) {
      const discovered = await this.evaluateCandidate(cand, candles);
      evaluatedCandidates.push(discovered);
    }

    const passedCandidates = evaluatedCandidates.filter((c) => c.status === 'PASSED');
    const rejectedCandidates = evaluatedCandidates.filter((c) => c.status === 'REJECTED');

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    const familiesSet = new Set(candidateConfigs.map((c) => c.familyId));

    const summary: ContinuousDiscoverySummary = {
      totalEvaluated: evaluatedCandidates.length,
      passedCount: passedCandidates.length,
      rejectedCount: rejectedCandidates.length,
      passRate: evaluatedCandidates.length > 0 ? passedCandidates.length / evaluatedCandidates.length : 0,
      familiesEvaluated: Array.from(familiesSet),
      startedAt,
      completedAt,
      durationMs,
      dataSource: dataSources ?? [],
    };

    logger.info('ContinuousDiscoveryPipeline: Cycle completed', {
      total: summary.totalEvaluated,
      passed: summary.passedCount,
      rejected: summary.rejectedCount,
      durationMs: summary.durationMs,
    });

    return {
      allCandidates: evaluatedCandidates,
      passedCandidates,
      rejectedCandidates,
      summary,
    };
  }

  /**
   * Evaluate a single candidate alpha configuration.
   */
  async evaluateCandidate(
    cand: CandidateAlphaConfig,
    candles: CandleLike[],
  ): Promise<DiscoveredAlphaCandidate> {
    // 1. Walkforward evaluation across rolling/expanding splits
    const wfResult = evaluateWalkForward({
      candles,
      config: cand.experimentConfig,
    });

    // 2. Quantitative Survival Gate evaluation
    const gateResult = evaluateAlphaSurvivalGate({
      summary: wfResult.summary,
      trades: wfResult.allTestTrades,
      criteria: this.config.survivalGates,
      baselineFeeBps: cand.experimentConfig.cost.feeBps,
      baselineSlippageBps: cand.experimentConfig.cost.slippageBps,
    });

    // 3. Diagnostic rejection generation if candidate failed
    const diagnostics = gateResult.passed
      ? undefined
      : generateCandidateRejectionDiagnostics(gateResult, wfResult.summary, cand.experimentConfig);

    return {
      strategyId: cand.candidateId,
      familyId: cand.familyId,
      params: cand.params,
      config: cand.experimentConfig,
      walkforwardResult: wfResult,
      walkforwardSummary: wfResult.summary,
      survivalGateResult: gateResult,
      status: gateResult.passed ? 'PASSED' : 'REJECTED',
      rejectionDiagnostics: diagnostics,
    };
  }
}
