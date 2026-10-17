/**
 * Alpha-Lab Autonomous Pipeline Orchestrator
 */

import type { ContinuousDiscoveryPipeline, ContinuousDiscoveryResult, DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import type { AISignal, AISignalAdapter } from '../../desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter, SignalRoutingOutcome } from '../../desk/strategies/ai-signal-paper-router';
import type { AlphaLifecycleStateMachine, PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';
import type { LiveGuardHandoffCoordinator, LiveOrderHandoffVerdict } from '../../desk/execution/live-guard-handoff';
import type { RegimeAwareKelly } from '../../desk/risk/regime-aware-kelly';
import type { CircuitBreaker } from '../../desk/risk/circuit-breaker';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type { CandleLike } from '../regimes/regime-types';
import type { PolymarketOrder } from '../../desk/execution/polymarket-signer';
import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { TradeSignal } from '../../desk/polymarket/strategy-live-bridge-types';
import type {
  AlphaLabAutonomousPipelineConfig,
  AutonomousCycleOptions,
  AutonomousCycleResult,
  AlphaLabPipelineStatus,
} from './alpha-lab-pipeline-types';
import {
  initPipelineCoreContext,
  type PipelineCoreContext,
} from './alpha-lab-pipeline-context';
import {
  startPipeline,
  stopPipeline,
  resetPipeline,
  appendPipelineLedger,
} from './alpha-lab-pipeline-actions';
import {
  runDiscovery,
  runCandidateIngestion,
  runSignalProcessing,
  runPromotionEvaluation,
  runLiveRiskEvaluation,
  runCycleExecution,
  runStatusCapture,
} from './alpha-lab-pipeline-executor';
import {
  getLifecycleStateMachine,
  getPaperRouter,
  getSignalAdapter,
  getLiveCoordinator,
  getDiscoveryPipeline,
  getRegimeKelly,
  getCircuitBreaker,
  getTrackedStrategyIds,
} from './alpha-lab-pipeline-accessors';

export type {
  AlphaLabAutonomousPipelineConfig,
  AutonomousCycleOptions,
  AutonomousCycleResult,
  AlphaLabPipelineStatus,
} from './alpha-lab-pipeline-types';
export {
  getLifecycleStateMachine,
  getPaperRouter,
  getSignalAdapter,
  getLiveCoordinator,
  getDiscoveryPipeline,
  getRegimeKelly,
  getCircuitBreaker,
  getTrackedStrategyIds,
  runDiscovery,
  runCandidateIngestion,
  runSignalProcessing,
  runPromotionEvaluation,
  runLiveRiskEvaluation,
  runCycleExecution,
  runStatusCapture,
};

export class AlphaLabAutonomousPipeline {
  private readonly ctx: PipelineCoreContext;

  constructor(config?: AlphaLabAutonomousPipelineConfig) {
    this.ctx = initPipelineCoreContext(config);
  }

  public async start(initialBalance?: number, forceReset = false): Promise<void> {
    return startPipeline(
      this.ctx.state,
      this.ctx.subsystems,
      this.ctx.ledgerPath,
      this.ctx.strictLedgerVerification,
      this.ctx.initialBalanceUsd,
      initialBalance,
      forceReset,
    );
  }

  public async stop(): Promise<void> {
    return stopPipeline(this.ctx.state, this.ctx.subsystems);
  }

  public async reset(initialBalance?: number): Promise<void> {
    return resetPipeline(this.ctx.state, this.ctx.subsystems, this.ctx.initialBalanceUsd, initialBalance);
  }

  private async persistLedgerRecord(
    input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>,
  ): Promise<LedgerWriteResult> {
    return appendPipelineLedger(this.ctx.state, this.ctx.ledgerPath, this.ctx.strictLedgerVerification, input);
  }

  public async discoverAndEvaluate(candles?: CandleLike[]): Promise<ContinuousDiscoveryResult> {
    return runDiscovery(this.ctx, this.persistLedgerRecord.bind(this), candles);
  }

  public ingestCandidateToPaper(
    candidate: DiscoveredAlphaCandidate,
    reason?: string,
  ): PromotionStateTransition {
    return runCandidateIngestion(this.ctx, candidate, this.persistLedgerRecord.bind(this), reason);
  }

  public async processSignals(
    signals: AISignal[],
    marketPrice: number,
  ): Promise<SignalRoutingOutcome[]> {
    return runSignalProcessing(this.ctx, signals, marketPrice);
  }

  public async evaluatePromotions(
    gateInputs?: Map<string, GateEvaluatorInput>,
  ): Promise<PromotionStateTransition[]> {
    return runPromotionEvaluation(this.ctx, this.persistLedgerRecord.bind(this), gateInputs);
  }

  public evaluateLiveOrder(request: {
    strategyId: string;
    order: PolymarketOrder;
    signal?: TradeSignal | AISignal;
  }): LiveOrderHandoffVerdict {
    return runLiveRiskEvaluation(this.ctx, request);
  }

  public async runCycle(options?: AutonomousCycleOptions): Promise<AutonomousCycleResult> {
    return runCycleExecution(this.ctx, this.persistLedgerRecord.bind(this), options);
  }

  public async getStatus(): Promise<AlphaLabPipelineStatus> {
    return runStatusCapture(this.ctx);
  }

  public getLifecycleStateMachine(strategyId: string): AlphaLifecycleStateMachine | undefined {
    return getLifecycleStateMachine(this.ctx, strategyId);
  }

  public getPaperRouter(): AISignalPaperRouter {
    return getPaperRouter(this.ctx);
  }

  public getSignalAdapter(): AISignalAdapter {
    return getSignalAdapter(this.ctx);
  }

  public getLiveCoordinator(): LiveGuardHandoffCoordinator {
    return getLiveCoordinator(this.ctx);
  }

  public getDiscoveryPipeline(): ContinuousDiscoveryPipeline {
    return getDiscoveryPipeline(this.ctx);
  }

  public getRegimeKelly(): RegimeAwareKelly {
    return getRegimeKelly(this.ctx);
  }

  public getCircuitBreaker(): CircuitBreaker {
    return getCircuitBreaker(this.ctx);
  }

  public getTrackedStrategyIds(): string[] {
    return getTrackedStrategyIds(this.ctx);
  }
}
