/**
 * Alpha-Lab Autonomous Pipeline Status Reporting
 */

import type { AISignalPaperRouter } from '../../desk/strategies/ai-signal-paper-router';
import type { PaperExecutor } from '../../desk/execution/paper-executor';
import type { LiveGuardHandoffCoordinator } from '../../desk/execution/live-guard-handoff';
import { readLedgerRecords, verifyLedgerChain } from '../provenance/research-ledger';
import type { AlphaLifecycleStateMachine, AlphaLifecycleState } from '../attribution/alpha-lifecycle-state-machine';
import type { AlphaLabPipelineStatus } from './alpha-lab-pipeline-types';

/**
 * Captures and returns a real-time status snapshot of the entire pipeline.
 */
export async function capturePipelineStatus(
  stateMachines: Map<string, AlphaLifecycleStateMachine>,
  paperExecutor: PaperExecutor,
  paperRouter: AISignalPaperRouter,
  liveCoordinator: LiveGuardHandoffCoordinator,
  ledgerPath: string,
  initialBalanceUsd: number,
  cycleCount: number,
  lastCycleAt: string | null,
  isRunning: boolean,
): Promise<AlphaLabPipelineStatus> {
  const lifecycleStates: Record<string, AlphaLifecycleState> = {};
  const stateDistribution: Record<AlphaLifecycleState, number> = {
    DISCOVERED: 0,
    PAPER_ACTIVE: 0,
    PROMOTED_LIVE_ELIGIBLE: 0,
    RETIRED: 0,
  };

  for (const [id, sm] of stateMachines.entries()) {
    const st = sm.getState();
    lifecycleStates[id] = st;
    stateDistribution[st] = (stateDistribution[st] ?? 0) + 1;
  }

  const paperPnl = paperExecutor.getPnlSummary();
  const openPositions = paperExecutor.getPositions();
  const equity = paperPnl.equity > 0 ? paperPnl.equity : initialBalanceUsd;
  const equityCurve = paperRouter.getEquityCurve();
  const latestSnapshot = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1] : undefined;
  const highWaterMark = latestSnapshot?.highWaterMark ?? equity;
  const maxHistoricalDrawdown = latestSnapshot?.maxDrawdown ?? 0;
  const liveHandoffStatus = liveCoordinator.getStatus();

  const records = await readLedgerRecords(ledgerPath);
  const isLedgerChainValid = verifyLedgerChain(records) === -1;

  return {
    cycleCount,
    lastCycleAt,
    isRunning,
    lifecycleStates,
    totalStrategiesCount: stateMachines.size,
    stateDistribution,
    paperPnl,
    openPositions,
    equity,
    highWaterMark,
    maxHistoricalDrawdown,
    liveHandoffStatus,
    isLedgerChainValid,
  };
}
