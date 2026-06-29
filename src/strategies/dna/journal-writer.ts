/**
 * DNA Journal Writer
 *
 * Persists DnaJournalEntry to the append-only `dna_journal` table.
 * One row per engine execution tick. The journal is the *source of truth* for
 * tractability: every execution can be replayed from journal rows alone.
 */

import { query } from '../../shared/db/postgres-client.js';
import { logger } from '../../shared/utils/logger.js';
import { journalWriteErrorsTotal } from '../../middleware/prometheus-metrics.js';
import type {
  ConsensusAction,
  ConsensusSignal,
  DnaJournalEntry,
  DnaLifecycleEvent,
  JournalDecision,
  MarketRegime,
  TfId,
} from './multi-tf-types.js';

const TABLE = 'dna_journal';

function classifyError(err: unknown): 'db_error' | 'timeout' | 'unknown' {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (
      msg.includes('database') ||
      msg.includes('connection') ||
      msg.includes('postgres') ||
      msg.includes('pg_') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset')
    ) {
      return 'db_error';
    }
  }
  return 'unknown';
}

const INSERT_SQL = /* sql */ `
  INSERT INTO ${TABLE} (
    trace_id, created_at, action, decision,
    confidence, weighted_bull, weighted_bear, regime, tf_signals, reason,
    executed_by, paper_mode, error_message,
    candle_tfs, candle_from_ms, candle_to_ms
  ) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8, $9::jsonb, $10,
    $11, $12, $13,
    $14, $15, $16
  )
  RETURNING id
`;

export function deriveDecision(raw: ConsensusSignal, paperMode: boolean): JournalDecision {
  if (paperMode) return 'paper_only';
  return raw.action === 'hold' ? 'rejected_low_confidence' : 'executed';
}

export function deriveExecutedBy(raw: ConsensusSignal, paperMode: boolean): 'live' | 'paper' | 'none' {
  if (paperMode) return 'paper';
  return raw.action === 'hold' ? 'none' : 'live';
}

export function eventToParams(ev: DnaLifecycleEvent):
  | Pick<
      DnaJournalEntry,
      | 'timestamp'
      | 'action'
      | 'decision'
      | 'confidence'
      | 'weightedBullScore'
      | 'weightedBearScore'
      | 'regime'
      | 'tfSignalsJson'
      | 'reason'
      | 'executedBy'
      | 'errorMessage'
      | 'candleSnapshotTfs'
      | 'candleTimestampRange'
    >
  | null {
  if (ev.type !== 'consensus_computed') return null;
  const c = ev.signal;
  if (!c) return null;

  const paperMode = false;
  return {
    timestamp: c.emittedAt,
    action: c.action,
    decision: deriveDecision(c, paperMode),
    confidence: c.confidence,
    weightedBullScore: c.weightedBullScore,
    weightedBearScore: c.weightedBearScore,
    regime: c.regime,
    tfSignalsJson: JSON.stringify(c.tfSignals),
    reason: c.reason,
    executedBy: deriveExecutedBy(c, paperMode),
    errorMessage: null,
    candleSnapshotTfs: [],
    candleTimestampRange: null,
  };
}

export async function writeJournalEntry(input: {
  traceId: string;
  timestamp: number;
  action: ConsensusAction;
  decision: JournalDecision;
  confidence: number;
  weightedBullScore: number;
  weightedBearScore: number;
  regime: MarketRegime;
  tfSignalsJson: string;
  reason: string;
  executedBy: 'live' | 'paper' | 'none';
  paperMode: boolean;
  errorMessage: string | null;
  candleSnapshotTfs: TfId[]; // matches canonical DnaJournalEntry.candleSnapshotTfs
  candleTimestampRange: { from: number; to: number } | null;
}): Promise<void> {
  try {
    const result = await query<{ id: string }>(INSERT_SQL, [
      input.traceId,
      new Date(input.timestamp).toISOString(),
      input.action,
      input.decision,
      input.confidence,
      input.weightedBullScore,
      input.weightedBearScore,
      input.regime,
      input.tfSignalsJson,
      input.reason,
      input.executedBy,
      input.paperMode,
      input.errorMessage,
      input.candleSnapshotTfs,
      input.candleTimestampRange?.from ?? null,
      input.candleTimestampRange?.to ?? null,
    ]);

  } catch (err) {
    const errorType = classifyError(err);
    journalWriteErrorsTotal.inc({ error_type: errorType });
    logger.error('[DNA-Journal] write failed', { err, traceId: input.traceId, errorType });
  }
}

