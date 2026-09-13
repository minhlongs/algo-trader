/**
 * Cheetahclaws-DNA: Multi-Timeframe Consensus Engine — Journal & Engine Config Types
 */

import type { TfId } from './multi-tf-indicators-types';
import type { ConsensusAction, MarketRegime, ConsensusSignal } from './multi-tf-signal-types';

export type JournalDecision =
  | 'executed'
  | 'rejected_tf_mismatch'
  | 'rejected_low_confidence'
  | 'rejected_regime_anomaly'
  | 'rejected_volatility_too_high'
  | 'paper_only'
  | 'aborted';

export interface PaperJournalEntry {
  id: string;
  traceId: string;
  at: number;
  action: 'enter_long' | 'enter_short' | 'exit_long' | 'exit_short' | 'hold';
  confidence: number;
  regime: MarketRegime;
  reason: string | null;
  source: string;
  executedBy: 'paper' | 'live';
  tfSignals: { tf: TfId; action: string; confidence: number }[];
  fillPrice: number | null;
  trade?: {
    marketId: string;
    side: 'long' | 'short';
    sizeUsd: number;
    entryPrice: number;
  };
}

export interface DnaJournalEntry {
  id: string; // uuid
  traceId: string;
  timestamp: number; // epoch-ms of the decision
  action: ConsensusAction;
  decision: JournalDecision;
  confidence: number;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: MarketRegime;
  tfSignalsJson: string; // JSON of tfSignals[] — queryable
  reason: string;
  executedBy: 'live' | 'paper' | 'none';
  errorMessage: string | null;
  // Replay metadata
  candleSnapshotTfs: TfId[]; // which TF candles were used
  candleTimestampRange: { from: number; to: number } | null;
}

export interface DnaEngineConfig {
  // Which TFs participate in consensus (order = priority weight fallback)
  tfOrder: TfId[];
  // Per-TF minimum confidence to count as a valid vote (explicit thresholds)
  minConfidencePerTf: Partial<Record<TfId, number>>;
  // Minimum aggregated confidence to produce an actionable signal
  minConsensusConfidence: number;
  // Bull/bear spread threshold (e.g. 0.15 = bull must lead bear by ≥15 pp)
  consensusSpread: number;
  // Max ATR% allowed to trade; above = reject (volatility circuit breaker)
  maxAtpPct: number;
  // If all TFs disagree → reject; if N of M agree → pass
  minTfAgreement: number;
  // Trace/logging
  journalTableName: string;
  logSignalLevel: 'debug' | 'info' | 'warn';
}

export const DEFAULT_DNA_CONFIG: DnaEngineConfig = {
  tfOrder: ['1m', '5m', '15m', '1h', '4h', '1d'],
  minConfidencePerTf: { '1m': 0.55, '5m': 0.55, '15m': 0.50, '1h': 0.45, '4h': 0.40, '1d': 0.35 },
  minConsensusConfidence: 0.60,
  consensusSpread: 0.15,
  maxAtpPct: 0.05,
  minTfAgreement: 3,
  journalTableName: 'dna_journal',
  logSignalLevel: 'info',
};

export type DnaLifecycleEvent =
  | { type: 'tick'; tf: TfId; at: number }
  | { type: 'tf_ready'; tf: TfId; candleCount: number }
  | { type: 'consensus_computed'; signal: ConsensusSignal | null }
  | { type: 'journal_written'; entry: DnaJournalEntry }
  | { type: 'paper_executed'; entry: PaperJournalEntry }
  | { type: 'paper_mode_changed'; enabled: boolean; at: number }
  | { type: 'error'; err: Error; context: string };

export type DnaLifecycleListener = (ev: DnaLifecycleEvent) => void;
