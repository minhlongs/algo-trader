import { createHash } from 'node:crypto';
import type { ResultClassName } from './run-card-types';
import type { AlphaLifecycleState } from '../attribution/alpha-lifecycle-state-types';
import { sortDeep } from './run-card-config';

export interface LedgerRecord {
  runId: string;
  configHash: string;
  resultClass: ResultClassName;
  strategyRef: string;
  lifecycleState?: AlphaLifecycleState;
  hypothesisId?: string;
  hypothesis?: string;
  parameters?: Record<string, unknown>;
  foldMetrics?: Record<string, number | undefined>;
  gateVerdict?: Record<string, boolean>;
  /** ISO-8601 UTC timestamp of the ledger entry. */
  recordedAt: string;
  /** Gate outcomes: gateId -> passed. */
  gates: Record<string, boolean>;
  /** SHA-256 of the previous record's canonical JSON (empty string for the first). */
  prevHash: string;
  entryHash?: string;
}

export type ResearchLedgerEntry = LedgerRecord;

export type LedgerWriteResult =
  | { ok: true; record: LedgerRecord }
  | { ok: false; error: string };

export interface LedgerQueryFilter {
  hypothesisId?: string;
  strategyRef?: string;
  resultClass?: ResultClassName;
  lifecycleState?: AlphaLifecycleState;
}

export function canonicalRecord(record: Omit<LedgerRecord, 'prevHash' | 'entryHash'>): string {
  const payload: Record<string, unknown> = {
    runId: record.runId,
    configHash: record.configHash,
    resultClass: record.resultClass,
    strategyRef: record.strategyRef,
    recordedAt: record.recordedAt,
    gates: record.gates ?? record.gateVerdict ?? {},
  };
  if (record.lifecycleState !== undefined) payload.lifecycleState = record.lifecycleState;
  if (record.hypothesisId !== undefined) payload.hypothesisId = record.hypothesisId;
  if (record.hypothesis !== undefined) payload.hypothesis = record.hypothesis;
  if (record.parameters !== undefined) payload.parameters = sortDeep(record.parameters);
  if (record.foldMetrics !== undefined) payload.foldMetrics = sortDeep(record.foldMetrics);
  if (record.gateVerdict !== undefined) payload.gateVerdict = sortDeep(record.gateVerdict);
  return JSON.stringify(payload);
}

export function computeRecordHash(record: Omit<LedgerRecord, 'prevHash' | 'entryHash'>): string {
  return createHash('sha256').update(canonicalRecord(record)).digest('hex');
}

export function filterLedgerRecords(records: LedgerRecord[], filter: LedgerQueryFilter): LedgerRecord[] {
  return records.filter((rec) => {
    if (filter.hypothesisId !== undefined && rec.hypothesisId !== filter.hypothesisId) return false;
    if (filter.strategyRef !== undefined && rec.strategyRef !== filter.strategyRef) return false;
    if (filter.resultClass !== undefined && rec.resultClass !== filter.resultClass) return false;
    if (filter.lifecycleState !== undefined && rec.lifecycleState !== filter.lifecycleState) return false;
    return true;
  });
}
