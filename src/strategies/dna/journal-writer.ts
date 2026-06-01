/**
 * DNA Journal Writer
 *
 * Persists DnaJournalEntry to the append-only `dna_journal` table.
 * One row per engine execution tick. The journal is the *source of truth* for
 * tractability: every execution can be replayed from journal rows alone.
 */
import { query } from '../../db/postgres-client.js';
import { logger } from '../../utils/logger.js';
import type { ConsensusAction, DnaLifecycleEvent, Regime } from './multi-tf-types.js';

// ─── Schema contract (must match migration 022) ──────────────────────────────
//
//  id               BIGSERIAL PRIMARY KEY
//  trace_id         TEXT NOT NULL
//  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
//  action           TEXT NOT NULL — ConsensusAction
//  decision         TEXT — JournalDecision
//  confidence       NUMERIC
//  weighted_bull    NUMERIC
//  weighted_bear    NUMERIC
//  reason           TEXT
//  regime           TEXT
//  tf_signals       JSONB
//  executed_by      TEXT — 'live' | 'paper' | 'none'
//  paper_mode       BOOLEAN
//  error_message    TEXT
//  candle_tfs       TEXT[]
//  candle_from_ms   BIGINT
//  candle_to_ms     BIGINT
//
export interface DnaJournalEntry {
  traceId: string;
  timestamp: number;
  action: ConsensusAction;
  decision?: string | null;
  confidence: number;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: Regime;
  tfSignals: { tf: string; action: string; confidence: number }[];
  reason?: string | null;
  executedBy: 'live' | 'paper' | 'none';
  paperMode: boolean;
  errorMessage?: string | null;
  candleSnapshotTfs: string[];
  candleTimestampRange: { from: number; to: number } | null;
}

export interface JournalWriterInput {
  traceId: string;
  timestamp: number;
  action: ConsensusAction;
  decision?: string | null;
  confidence: number;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: Regime;
  tfSignals: { tf: string; action: string; confidence: number }[];
  reason?: string | null;
  executedBy: 'live' | 'paper' | 'none';
  paperMode: boolean;
  errorMessage?: string | null;
  candleSnapshotTfs: string[];
  candleTimestampRange: { from: number; to: number } | null;
}

const JOURNAL_TABLE = 'dna_journal';

// Column list matches migration 022 schema exactly.
const INSERT_SQL = /* sql */ `
 INSERT INTO ${JOURNAL_TABLE}
   (trace_id, created_at, action, decision, confidence,
    weighted_bull, weighted_bear, regime, tf_signals, reason,
    executed_by, paper_mode, error_message,
    candle_tfs, candle_from_ms, candle_to_ms)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10,
         $11, $12, $13, $14, $15, $16)
 `;

/**
 * Map a lifecycle event to journal parameters.
 * Returns null when the event should not produce a journal row.
 */
function eventToParams(ev: DnaLifecycleEvent): JournalWriterInput | null {
  if (ev.type !== 'consensus_computed') return null;
  const c = ev.signal;
  return {
    traceId: c.traceId,
    timestamp: c.emittedAt,
    action: c.action,
    decision: c.decision ?? null,
    confidence: c.confidence,
    weightedBullScore: c.weightedBullScore,
    weightedBearScore: c.weightedBearScore,
    regime: c.regime,
    tfSignals: c.tfSignals.map(s => ({ tf: s.tf, action: s.action, confidence: s.confidence })),
    reason: c.reason ?? null,
    executedBy: c.executedBy,
    paperMode: false,
    errorMessage: null,
    candleSnapshotTfs: c.candleSnapshotTfs,
    candleTimestampRange: null,
  };
}

export async function writeJournalEntry(input: JournalWriterInput): Promise<void> {
  const entry: DnaJournalEntry = {
    ...input,
    tfSignals: input.tfSignals,
  };

  try {
    await query(INSERT_SQL, [
      entry.traceId,
      new Date(entry.timestamp).toISOString(),
      entry.action,
      entry.decision,
      entry.confidence,
      entry.weightedBullScore,
      entry.weightedBearScore,
      entry.regime,
      JSON.stringify(entry.tfSignals),
      entry.reason,
      entry.executedBy,
      entry.paperMode,
      entry.errorMessage ?? null,
      entry.candleSnapshotTfs,
      entry.candleTimestampRange?.from ?? null,
      entry.candleTimestampRange?.to ?? null,
    ]);
    emit({ type: 'journal_written', entry });
  } catch (err) {
    // Journal write must NEVER break the trading loop; log and continue.
    logger.error('[DNA-Journal] write failed', { err, traceId: entry.traceId });
  }
}

/**
 * Optional lifecycle hook: re-emit `journal_written` so the orchestrator can
 * feed it back into its event bus without coupling.
 */
function emit(ev: DnaLifecycleEvent): void {
  // no-op placeholder for future wire-up if needed
}
