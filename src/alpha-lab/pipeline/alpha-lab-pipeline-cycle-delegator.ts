/**
 * Alpha-Lab Autonomous Pipeline Cycle & Status Delegation Helpers
 */

import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type {
  AutonomousCycleOptions,
  AutonomousCycleResult,
  AlphaLabPipelineStatus,
} from './alpha-lab-pipeline-types';
import type { PipelineSubsystems } from './alpha-lab-pipeline-factory';
import type { PipelineStateManager } from './alpha-lab-pipeline-state';
import {
  runAutonomousPipelineCycle,
  capturePipelineStatus,
} from './alpha-lab-pipeline-runner';

export type PersistLedgerFn = (
  input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>,
) => Promise<LedgerWriteResult>;

export async function executePipelineCycle(
  subsystems: PipelineSubsystems,
  state: PipelineStateManager,
  symbol: string,
  timeframe: string,
  initialBalanceUsd: number,
  ledgerPath: string,
  runCardDir: string,
  persistLedger: PersistLedgerFn,
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
