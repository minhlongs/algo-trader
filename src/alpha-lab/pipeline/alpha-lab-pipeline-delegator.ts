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
  executePipelineCycle,
  executeStatusCapture,
  type PersistLedgerFn,
} from './alpha-lab-pipeline-cycle-delegator';

export { executePipelineCycle, executeStatusCapture, type PersistLedgerFn };

export async function executeDiscovery(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: PersistLedgerFn,
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
  persistLedger: PersistLedgerFn,
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
  return routeCandidateSignals(subsystems.paperRouter, state.stateMachines, signals, marketPrice, symbol);
}

export async function executePromotionEvaluation(
  state: PipelineStateManager,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: PersistLedgerFn,
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
  request: { strategyId: string; order: PolymarketOrder; signal?: TradeSignal | AISignal },
): LiveOrderHandoffVerdict {
  return evaluateLiveRiskHandoff(subsystems.liveCoordinator, state.stateMachines, symbol, request);
}

