/**
 * Alpha-Lab Autonomous Pipeline Delegator Helpers
 */

import type { DiscoveredAlphaCandidate, ContinuousDiscoveryResult } from '../alpha-discovery/continuous-discovery-pipeline';
import type { CandleLike } from '../regimes/regime-types';
import type { AISignal } from '../../desk/strategies/ai-signal-adapter';
import type { SignalRoutingOutcome } from '../../desk/strategies/ai-signal-paper-router';
import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { PolymarketOrder } from '../../desk/execution/polymarket-signer';
import type { TradeSignal } from '../../desk/polymarket/strategy-live-bridge-types';
import type { LiveOrderHandoffVerdict } from '../../desk/execution/live-guard-handoff';
import type { PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type {
  AutonomousCycleOptions,
  AutonomousCycleResult,
  AlphaLabPipelineStatus,
} from './alpha-lab-pipeline-types';
import type { PipelineSubsystems } from './alpha-lab-pipeline-factory';
import type { PipelineStateManager } from './alpha-lab-pipeline-state';
import { runDiscoveryAndRegistration } from './alpha-lab-pipeline-discovery';
import {
  ingestCandidateToPaperStateMachine,
  routeCandidateSignals,
  evaluateActivePaperPromotions,
  evaluateLiveRiskHandoff,
} from './alpha-lab-pipeline-promoter';
import {
  runAutonomousPipelineCycle,
  capturePipelineStatus,
} from './alpha-lab-pipeline-runner';

export async function executeDiscovery(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  candles?: CandleLike[],
): Promise<ContinuousDiscoveryResult> {
  return runDiscoveryAndRegistration(
    subsystems.discoveryPipeline,
    state.stateMachines,
    state.candidateConfigs,
    state.lastKnownCandidates,
    symbol,
    timeframe,
    runCardDir,
    persistLedger,
    candles,
  );
}

export function executeCandidateIngestion(
  candidate: DiscoveredAlphaCandidate,
  state: PipelineStateManager,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  reason?: string,
): PromotionStateTransition {
  return ingestCandidateToPaperStateMachine(
    candidate,
    state.stateMachines,
    state.candidateConfigs,
    state.lastKnownCandidates,
    persistLedger,
    reason,
  );
}

export async function executeSignalProcessing(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  signals: AISignal[],
  marketPrice: number,
  symbol: string,
): Promise<SignalRoutingOutcome[]> {
  return routeCandidateSignals(
    subsystems.paperRouter,
    state.stateMachines,
    signals,
    marketPrice,
    symbol,
  );
}

export async function executePromotionEvaluation(
  state: PipelineStateManager,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  gateInputs?: Map<string, GateEvaluatorInput>,
): Promise<PromotionStateTransition[]> {
  return evaluateActivePaperPromotions(
    state.stateMachines,
    state.candidateConfigs,
    symbol,
    timeframe,
    runCardDir,
    persistLedger,
    gateInputs,
  );
}

export function executeLiveRiskEvaluation(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  symbol: string,
  request: {
    strategyId: string;
    order: PolymarketOrder;
    signal?: TradeSignal | AISignal;
  },
): LiveOrderHandoffVerdict {
  return evaluateLiveRiskHandoff(
    subsystems.liveCoordinator,
    state.stateMachines,
    symbol,
    request,
  );
}

export async function executePipelineCycle(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  symbol: string,
  timeframe: string,
  initialBalanceUsd: number,
  ledgerPath: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  options?: AutonomousCycleOptions,
): Promise<AutonomousCycleResult> {
  const cycleCount = state.incrementCycle();
  const { result, completedAt } = await runAutonomousPipelineCycle(
    {
      discoveryPipeline: subsystems.discoveryPipeline,
      paperRouter: subsystems.paperRouter,
      paperExecutor: subsystems.paperExecutor,
      liveCoordinator: subsystems.liveCoordinator,
      stateMachines: state.stateMachines,
      candidateConfigs: state.candidateConfigs,
      lastKnownCandidates: state.lastKnownCandidates,
      symbol,
      timeframe,
      initialBalanceUsd,
      ledgerPath,
      runCardDir,
      cycleCount,
      isRunning: state.isRunning,
      persistLedger,
    },
    options,
  );
  state.setLastCycleAt(completedAt);
  return result;
}

export async function executeStatusCapture(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  ledgerPath: string,
  initialBalanceUsd: number,
): Promise<AlphaLabPipelineStatus> {
  return capturePipelineStatus(
    state.stateMachines,
    subsystems.paperExecutor,
    subsystems.paperRouter,
    subsystems.liveCoordinator,
    ledgerPath,
    initialBalanceUsd,
    state.cycleCount,
    state.lastCycleAt,
    state.isRunning,
  );
}
