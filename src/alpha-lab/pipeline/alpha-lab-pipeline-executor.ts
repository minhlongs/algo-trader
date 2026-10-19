/**
 * Master delegator and executor methods for AlphaLabAutonomousPipeline.
 *
 * @module alpha-lab/pipeline/alpha-lab-pipeline-executor
 */

import type { DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import type { AISignal } from '../../desk/strategies/ai-signal-adapter';
import type { SignalRoutingOutcome } from '../../desk/strategies/ai-signal-paper-router';
import type { PromotionStateTransition } from '../attribution/alpha-lifecycle-state-machine';
import type { LiveOrderHandoffVerdict } from '../../desk/execution/live-guard-handoff';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type { CandleLike } from '../regimes/regime-types';
import type { PolymarketOrder } from '../../desk/execution/polymarket-signer';
import type { GateEvaluatorInput } from '../gates/gate-evaluator-types';
import type { TradeSignal } from '../../desk/polymarket/strategy-live-bridge-types';
import type {
  AutonomousCycleOptions,
  AutonomousCycleResult,
  AlphaLabPipelineStatus,
} from './alpha-lab-pipeline-types';
import type { PipelineCoreContext } from './alpha-lab-pipeline-context';
import {
  executeDiscovery,
  executeCandidateIngestion,
  executeSignalProcessing,
  executePromotionEvaluation,
  executeLiveRiskEvaluation,
  executePipelineCycle,
  executeStatusCapture,
} from './alpha-lab-pipeline-delegator';

export function runDiscovery(
  ctx: PipelineCoreContext,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  candles?: CandleLike[],
) {
  return executeDiscovery(
    ctx.subsystems,
    ctx.state,
    ctx.symbol,
    ctx.timeframe,
    ctx.runCardDir,
    persistLedger,
    candles,
  );
}

export function runCandidateIngestion(
  ctx: PipelineCoreContext,
  candidate: DiscoveredAlphaCandidate,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  reason?: string,
): PromotionStateTransition {
  return executeCandidateIngestion(candidate, ctx.state, persistLedger, reason);
}

export function runSignalProcessing(
  ctx: PipelineCoreContext,
  signals: AISignal[],
  marketPrice: number,
): Promise<SignalRoutingOutcome[]> {
  return executeSignalProcessing(
    ctx.subsystems,
    ctx.state,
    signals,
    marketPrice,
    ctx.symbol,
  );
}

export function runPromotionEvaluation(
  ctx: PipelineCoreContext,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  gateInputs?: Map<string, GateEvaluatorInput>,
): Promise<PromotionStateTransition[]> {
  return executePromotionEvaluation(
    ctx.state,
    ctx.symbol,
    ctx.timeframe,
    ctx.runCardDir,
    persistLedger,
    gateInputs,
  );
}

export function runLiveRiskEvaluation(
  ctx: PipelineCoreContext,
  request: {
    strategyId: string;
    order: PolymarketOrder;
    signal?: TradeSignal | AISignal;
  },
): LiveOrderHandoffVerdict {
  return executeLiveRiskEvaluation(
    ctx.subsystems,
    ctx.state,
    ctx.symbol,
    request,
  );
}

export function runCycleExecution(
  ctx: PipelineCoreContext,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  options?: AutonomousCycleOptions,
): Promise<AutonomousCycleResult> {
  return executePipelineCycle(
    ctx.subsystems,
    ctx.state,
    ctx.symbol,
    ctx.timeframe,
    ctx.initialBalanceUsd,
    ctx.ledgerPath,
    ctx.runCardDir,
    persistLedger,
    options,
  );
}

export function runStatusCapture(ctx: PipelineCoreContext): Promise<AlphaLabPipelineStatus> {
  return executeStatusCapture(
    ctx.subsystems,
    ctx.state,
    ctx.ledgerPath,
    ctx.initialBalanceUsd,
  );
}
