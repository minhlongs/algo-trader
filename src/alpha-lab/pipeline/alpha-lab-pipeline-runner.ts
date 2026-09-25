/**
 * Alpha-Lab Autonomous Pipeline Cycle Execution & Runner
 */

import { classifyRegime } from '../regimes/regime-engine';
import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import type { ContinuousDiscoveryPipeline, DiscoveredAlphaCandidate } from '../alpha-discovery/continuous-discovery-pipeline';
import { candidateToAISignal, type AISignal } from '../../desk/strategies/ai-signal-adapter';
import type { AISignalPaperRouter } from '../../desk/strategies/ai-signal-paper-router';
import type { PaperExecutor } from '../../desk/execution/paper-executor';
import type { LiveGuardHandoffCoordinator } from '../../desk/execution/live-guard-handoff';
import { readLedgerRecords, type LedgerRecord, type LedgerWriteResult } from '../provenance/research-ledger';
import type { RunCard } from '../provenance/run-card';
import type { AlphaLifecycleStateMachine } from '../attribution/alpha-lifecycle-state-machine';
import type {
  AutonomousCycleOptions,
  AutonomousCycleResult,
} from './alpha-lab-pipeline-types';
import {
  ingestCandidateToPaperStateMachine,
  routeCandidateSignals,
  evaluateActivePaperPromotions,
} from './alpha-lab-pipeline-promoter';
import { capturePipelineStatus } from './alpha-lab-pipeline-status';
import { runDiscoveryAndRegistration } from './alpha-lab-pipeline-discovery';

export { runDiscoveryAndRegistration } from './alpha-lab-pipeline-discovery';
export { capturePipelineStatus } from './alpha-lab-pipeline-status';

export interface PipelineCycleContext {
  discoveryPipeline: ContinuousDiscoveryPipeline;
  paperRouter: AISignalPaperRouter;
  paperExecutor: PaperExecutor;
  liveCoordinator: LiveGuardHandoffCoordinator;
  stateMachines: Map<string, AlphaLifecycleStateMachine>;
  candidateConfigs: Map<string, Record<string, unknown>>;
  lastKnownCandidates: Map<string, DiscoveredAlphaCandidate>;
  symbol: string;
  timeframe: string;
  initialBalanceUsd: number;
  ledgerPath: string;
  runCardDir: string;
  cycleCount: number;
  isRunning: boolean;
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>;
}

/**
 * Runs a complete autonomous cycle across discovery, paper execution, promotion, and ledger logging.
 */
export async function runAutonomousPipelineCycle(
  context: PipelineCycleContext,
  options?: AutonomousCycleOptions,
): Promise<{ result: AutonomousCycleResult; completedAt: string }> {
  const cycleId = `cycle-${context.cycleCount}-${Date.now()}`;
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  // 1. Discovery & Walkforward Evaluation
  const discoveryResult = await runDiscoveryAndRegistration(
    context.discoveryPipeline,
    context.stateMachines,
    context.candidateConfigs,
    context.lastKnownCandidates,
    context.symbol,
    context.timeframe,
    context.runCardDir,
    context.persistLedger,
    options?.candles,
  );

  // 2. Ingest passing candidates into paper trading
  for (const passed of discoveryResult.passedCandidates) {
    const sm = context.stateMachines.get(passed.strategyId);
    if (sm && sm.getState() === 'DISCOVERED') {
      ingestCandidateToPaperStateMachine(
        passed,
        context.stateMachines,
        context.candidateConfigs,
        context.lastKnownCandidates,
        context.persistLedger,
      );
    }
  }

  // 3. Convert passing candidates to AISignals
  let currentRegime: MarketRegime = options?.regime ?? 'TREND_UP';
  if (!options?.regime && options?.candles && options.candles.length >= 20) {
    try {
      currentRegime = classifyRegime(
        { market: context.symbol, timeframe: context.timeframe, lookback: 20 },
        options.candles,
      ).regime;
    } catch {
      currentRegime = 'TREND_UP';
    }
  }

  const direction = options?.signalDirection ?? 'BUY';
  const signals: AISignal[] = [];
  for (const cand of discoveryResult.passedCandidates) {
    const sig = candidateToAISignal(cand, currentRegime, direction, context.symbol);
    signals.push(sig);
  }

  // 4. Route signals through paper trading
  const currentPrice = options?.currentPrice ?? 50_000;
  const routingOutcomes = await routeCandidateSignals(
    context.paperRouter,
    context.stateMachines,
    signals,
    currentPrice,
    context.symbol,
  );

  // 5. Evaluate promotions & retirement
  const promotionTransitions = await evaluateActivePaperPromotions(
    context.stateMachines,
    context.candidateConfigs,
    context.symbol,
    context.timeframe,
    context.runCardDir,
    context.persistLedger,
    options?.gateInputs,
  );

  // 6. Gather RunCards and LedgerRecords for this cycle
  const ledgerRecords = await readLedgerRecords(context.ledgerPath);
  const runCards: RunCard[] = [];

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;
  const status = await capturePipelineStatus(
    context.stateMachines,
    context.paperExecutor,
    context.paperRouter,
    context.liveCoordinator,
    context.ledgerPath,
    context.initialBalanceUsd,
    context.cycleCount,
    completedAt,
    context.isRunning,
  );

  return {
    completedAt,
    result: {
      cycleId,
      startedAt,
      completedAt,
      durationMs,
      discoveryResult,
      signals,
      routingOutcomes,
      promotionTransitions,
      runCards,
      ledgerRecords,
      status,
    },
  };
}
