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
  executeDiscovery,
  executeCandidateIngestion,
  executeSignalProcessing,
  executePromotionEvaluation,
  executeLiveRiskEvaluation,
  executePipelineCycle,
  executeStatusCapture,
} from './alpha-lab-pipeline-delegator';

export type {
  AlphaLabAutonomousPipelineConfig,
  AutonomousCycleOptions,
  AutonomousCycleResult,
  AlphaLabPipelineStatus,
} from './alpha-lab-pipeline-types';

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
    return executeDiscovery(this.ctx.subsystems, this.ctx.state, this.ctx.symbol, this.ctx.timeframe, this.ctx.runCardDir, this.persistLedgerRecord.bind(this), candles);
  }

  public ingestCandidateToPaper(
    candidate: DiscoveredAlphaCandidate,
    reason?: string,
  ): PromotionStateTransition {
    return executeCandidateIngestion(
      candidate,
      this.ctx.state,
      this.persistLedgerRecord.bind(this),
      reason,
    );
  }

  public async processSignals(
    signals: AISignal[],
    marketPrice: number,
  ): Promise<SignalRoutingOutcome[]> {
    return executeSignalProcessing(
      this.ctx.subsystems,
      this.ctx.state,
      signals,
      marketPrice,
      this.ctx.symbol,
    );
  }

  public async evaluatePromotions(
    gateInputs?: Map<string, GateEvaluatorInput>,
  ): Promise<PromotionStateTransition[]> {
    return executePromotionEvaluation(
      this.ctx.state,
      this.ctx.symbol,
      this.ctx.timeframe,
      this.ctx.runCardDir,
      this.persistLedgerRecord.bind(this),
      gateInputs,
    );
  }

  public evaluateLiveOrder(request: {
    strategyId: string;
    order: PolymarketOrder;
    signal?: TradeSignal | AISignal;
  }): LiveOrderHandoffVerdict {
    return executeLiveRiskEvaluation(
      this.ctx.subsystems,
      this.ctx.state,
      this.ctx.symbol,
      request,
    );
  }

  public async runCycle(options?: AutonomousCycleOptions): Promise<AutonomousCycleResult> {
    return executePipelineCycle(
      this.ctx.subsystems,
      this.ctx.state,
      this.ctx.symbol,
      this.ctx.timeframe,
      this.ctx.initialBalanceUsd,
      this.ctx.ledgerPath,
      this.ctx.runCardDir,
      this.persistLedgerRecord.bind(this),
      options,
    );
  }

  public async getStatus(): Promise<AlphaLabPipelineStatus> {
    return executeStatusCapture(
      this.ctx.subsystems,
      this.ctx.state,
      this.ctx.ledgerPath,
      this.ctx.initialBalanceUsd,
    );
  }

  public getLifecycleStateMachine(strategyId: string): AlphaLifecycleStateMachine | undefined {
    return this.ctx.state.stateMachines.get(strategyId);
  }

  public getPaperRouter(): AISignalPaperRouter {
    return this.ctx.subsystems.paperRouter;
  }

  public getSignalAdapter(): AISignalAdapter {
    return this.ctx.subsystems.signalAdapter;
  }

  public getLiveCoordinator(): LiveGuardHandoffCoordinator {
    return this.ctx.subsystems.liveCoordinator;
  }

  public getDiscoveryPipeline(): ContinuousDiscoveryPipeline {
    return this.ctx.subsystems.discoveryPipeline;
  }

  public getRegimeKelly(): RegimeAwareKelly {
    return this.ctx.subsystems.regimeKelly;
  }

  public getCircuitBreaker(): CircuitBreaker {
    return this.ctx.subsystems.circuitBreaker;
  }

  public getTrackedStrategyIds(): string[] {
    return Array.from(this.ctx.state.stateMachines.keys());
  }
}
