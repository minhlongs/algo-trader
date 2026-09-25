/**
 * Alpha-Lab Autonomous Pipeline Actions
 */

import type { PipelineStateManager } from './alpha-lab-pipeline-state';
import type { PipelineSubsystems } from './alpha-lab-pipeline-factory';
import { validateLedgerChain, persistPipelineLedgerRecord } from './alpha-lab-pipeline-provenance';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';

export async function startPipeline(
  state: PipelineStateManager,
  subsystems: PipelineSubsystems,
  ledgerPath: string,
  strictLedgerVerification: boolean,
  initialBalanceUsd: number,
  initialBalance?: number,
  forceReset = false,
): Promise<void> {
  if (strictLedgerVerification) {
    const brokenIndex = await validateLedgerChain(ledgerPath);
    if (brokenIndex !== -1) {
      throw new Error(
        `Cannot start pipeline: ledger chain integrity breach detected at record index ${brokenIndex}`,
      );
    }
  }
  await subsystems.paperRouter.start(initialBalance ?? initialBalanceUsd, forceReset);
  state.isRunning = true;
}

export async function stopPipeline(
  state: PipelineStateManager,
  subsystems: PipelineSubsystems,
): Promise<void> {
  await subsystems.paperRouter.stop();
  state.isRunning = false;
}

export async function resetPipeline(
  state: PipelineStateManager,
  subsystems: PipelineSubsystems,
  initialBalanceUsd: number,
  initialBalance?: number,
): Promise<void> {
  await subsystems.paperRouter.reset(initialBalance ?? initialBalanceUsd);
  state.reset();
}

export async function appendPipelineLedger(
  state: PipelineStateManager,
  ledgerPath: string,
  strictLedgerVerification: boolean,
  input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>,
): Promise<LedgerWriteResult> {
  const { nextQueue, result } = persistPipelineLedgerRecord(
    state.ledgerQueue,
    ledgerPath,
    strictLedgerVerification,
    input,
  );
  state.ledgerQueue = nextQueue;
  return result;
}
