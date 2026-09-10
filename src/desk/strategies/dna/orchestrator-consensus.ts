import type {
  TfId,
  TimeframeIndicators,
  TfSignal,
  RegimeSnapshot,
  ConsensusSignal,
  JournalDecision,
  DnaEngineConfig,
} from './multi-tf-types';
import { detectRegime, isRegimeFresh } from './regime-detector';
import { computeConsensus } from './consensus-engine';
import { writeJournalEntry } from './journal-writer';
import { executePaperConsensus } from './paper-executor';
import { emitDnaLifecycleEvent } from './orchestrator-lifecycle';
import { logger } from '../../utils/logger';

export interface ConsensusStepParams {
  tfSignals: TfSignal[];
  lastRegime: RegimeSnapshot | null;
  traceId: string;
  now: number;
  config: DnaEngineConfig;
  paperMode: boolean;
}

export interface ConsensusStepResult {
  regime: RegimeSnapshot;
  consensus: ConsensusSignal;
  decision: JournalDecision;
}

export function resolveRegime(
  tfSignals: TfSignal[],
  currentRegime: RegimeSnapshot | null,
  now: number,
): RegimeSnapshot {
  if (currentRegime && isRegimeFresh(currentRegime, now)) {
    return currentRegime;
  }
  const indicatorsByTf = new Map<TfId, TimeframeIndicators>();
  for (const s of tfSignals) {
    indicatorsByTf.set(s.tf, {
      tf: s.tf,
      candles: [],
      trend: s.indicatorSnap.trend,
      momentum: s.indicatorSnap.momentum,
      volatility: s.indicatorSnap.volatility,
      microstructure: { obi: null, vwap: null, deltaCandle: null },
      computedAt: s.emittedAt,
    });
  }
  return detectRegime(indicatorsByTf, now);
}

export async function runDnaConsensusStep(
  params: ConsensusStepParams,
): Promise<ConsensusStepResult> {
  const { tfSignals, lastRegime, traceId, now, config, paperMode } = params;

  const regime = resolveRegime(tfSignals, lastRegime, now);
  const consensus = computeConsensus({
    tfSignals,
    regime,
    traceId,
    now,
    config,
  });

  const decision: JournalDecision =
    consensus.action === 'hold'
      ? 'rejected_low_confidence'
      : paperMode
      ? 'paper_only'
      : 'executed';

  const candleTsRange = tfSignals.length > 0
    ? {
      from: Math.min(...tfSignals.map((s) => s.emittedAt)),
      to: Math.max(...tfSignals.map((s) => s.emittedAt)),
    }
    : null;

  await writeJournalEntry({
    traceId: consensus.traceId,
    timestamp: now,
    action: consensus.action,
    decision,
    confidence: consensus.confidence,
    weightedBullScore: consensus.weightedBullScore,
    weightedBearScore: consensus.weightedBearScore,
    regime: regime.regime,
    tfSignalsJson: JSON.stringify(consensus.tfSignals),
    reason: consensus.reason,
    executedBy: paperMode ? 'paper' : consensus.action === 'hold' ? 'none' : 'live',
    paperMode: true,
    errorMessage: null,
    candleSnapshotTfs: tfSignals.map((s) => s.tf),
    candleTimestampRange: candleTsRange,
  });

  emitDnaLifecycleEvent({ type: 'consensus_computed', signal: consensus });

  if (paperMode) {
    executePaperConsensus(consensus);
  }

  logger.info('[DNA] consensus', {
    traceId,
    action: consensus.action,
    confidence: consensus.confidence,
    regime: regime.regime,
    decision,
  });

  return { regime, consensus, decision };
}
