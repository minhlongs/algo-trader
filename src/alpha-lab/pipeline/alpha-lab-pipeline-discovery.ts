/**
 * Alpha-Lab Autonomous Pipeline Discovery Integration
 */

import type { CandleLike } from '../regimes/regime-types';
import type {
  ContinuousDiscoveryPipeline,
  ContinuousDiscoveryResult,
  DiscoveredAlphaCandidate,
} from '../alpha-discovery/continuous-discovery-pipeline';
import { AlphaLifecycleStateMachine } from '../attribution/alpha-lifecycle-state-machine';
import type { LedgerRecord, LedgerWriteResult } from '../provenance/research-ledger';
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
