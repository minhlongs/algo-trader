/**
 * Alpha-Lab Autonomous Pipeline Discovery Integration
 */

import { classifyRegime } from '../regimes/regime-engine';
import type { CandleLike, MarketRegime } from '../regimes/regime-types';
import type {
  ContinuousDiscoveryPipeline,
  ContinuousDiscoveryResult,
  DiscoveredAlphaCandidate,
} from '../alpha-discovery/continuous-discovery-pipeline';
import { candidateToAISignal, type AISignal } from '../../desk/strategies/ai-signal-adapter';
import { AlphaLifecycleStateMachine } from '../attribution/alpha-lifecycle-state-machine';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
import type { AutonomousCycleOptions } from './alpha-lab-pipeline-types';
import { recordCandidateProvenance } from './alpha-lab-pipeline-provenance';

/**
 * Runs continuous discovery and registers discovered candidates in state machines and run cards.
 */
export async function runDiscoveryAndRegistration(
  discoveryPipeline: ContinuousDiscoveryPipeline,
  stateMachines: Map<string, AlphaLifecycleStateMachine>,
  candidateConfigs: Map<string, Record<string, unknown>>,
  lastKnownCandidates: Map<string, DiscoveredAlphaCandidate>,
  symbol: string,
  timeframe: string,
  runCardDir: string,
  persistLedger: (input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash'>) => Promise<LedgerWriteResult>,
  candles?: CandleLike[],
): Promise<ContinuousDiscoveryResult> {
  if (candles) {
    discoveryPipeline.setCandles(candles);
  }
  const discoveryResult = await discoveryPipeline.runCycle();

  for (const candidate of discoveryResult.allCandidates) {
    if (!stateMachines.has(candidate.strategyId)) {
      stateMachines.set(
        candidate.strategyId,
        new AlphaLifecycleStateMachine(candidate.strategyId, 'DISCOVERED'),
      );
    }
    candidateConfigs.set(
      candidate.strategyId,
      candidate.config as unknown as Record<string, unknown>,
    );
    lastKnownCandidates.set(candidate.strategyId, candidate);

    await recordCandidateProvenance(
      candidate,
      symbol,
      timeframe,
      runCardDir,
      persistLedger,
    );
  }

  return discoveryResult;
}

export function buildCandidateSignalsForCycle(
  passedCandidates: DiscoveredAlphaCandidate[],
  symbol: string,
  timeframe: string,
  options?: AutonomousCycleOptions,
): AISignal[] {
  let currentRegime: MarketRegime = options?.regime ?? 'TREND_UP';
  if (!options?.regime && options?.candles && options.candles.length >= 20) {
    try {
      currentRegime = classifyRegime(
        { market: symbol, timeframe, lookback: 20 },
        options.candles,
      ).regime;
    } catch {
      currentRegime = 'TREND_UP';
    }
  }

  const direction = options?.signalDirection ?? 'BUY';
  return passedCandidates.map((cand) =>
    candidateToAISignal(cand, currentRegime, direction, symbol),
  );
}
