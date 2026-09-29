/**
 * Research Ledger
 *
 * Append-only JSONL ledger recording every research run. Each line is a
 * self-contained record: runId, configHash, resultClass, gate outcomes, and a
 * timestamp. The ledger is the governance trail — it lets a reviewer answer
 * "which runs were promoted, which were rejected, and on what evidence" without
 * re-running anything.
 *
 * Tamper-resistance: every record carries a `prevHash` chaining the SHA-256 of
 * the previous record's canonical JSON. A reader can verify the chain and detect
 * any in-place edit or deletion. This is a lightweight integrity check, not a
 * cryptographic guarantee — the file lives on disk and is not signed.
 *
 * Fail-safe: a write failure is logged and returned as `{ ok: false }`; it never
 * throws and never loses the caller's result.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { logger } from '../../shared/utils/logger';
import type { ResultClassName } from './run-card-types';
import type { AlphaLifecycleState } from '../attribution/alpha-lifecycle-state-types';
import { sortDeep } from './run-card-config';

// ── Ledger Record ─────────────────────────────────────────────────────────────

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

// ── Default path ──────────────────────────────────────────────────────────────

/** Default ledger location relative to the repo root. */
export const DEFAULT_LEDGER_PATH = join('data', 'research-ledger.jsonl');

// ── Hashing ───────────────────────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a record to the ledger. Reads the last line to compute `prevHash`,
 * then appends one JSON line. Fail-safe: never throws.
 */
export async function appendLedgerRecord(
  input: Omit<LedgerRecord, 'prevHash' | 'recordedAt' | 'entryHash' | 'gates'> & {
    gates?: Record<string, boolean>;
  },
  ledgerPath: string = DEFAULT_LEDGER_PATH,
): Promise<LedgerWriteResult> {
  try {
    await mkdir(dirname(ledgerPath), { recursive: true });
    const prevHash = await readLastHash(ledgerPath);
    const recordedAt = new Date().toISOString();
    const candidate: Omit<LedgerRecord, 'prevHash' | 'entryHash'> = {
      runId: input.runId,
      configHash: input.configHash,
      resultClass: input.resultClass,
      strategyRef: input.strategyRef,
      recordedAt,
      gates: input.gates ?? input.gateVerdict ?? {},
    };
    if (input.lifecycleState !== undefined) candidate.lifecycleState = input.lifecycleState;
    if (input.hypothesisId !== undefined) candidate.hypothesisId = input.hypothesisId;
    if (input.hypothesis !== undefined) candidate.hypothesis = input.hypothesis;
    if (input.parameters !== undefined) candidate.parameters = input.parameters;
    if (input.foldMetrics !== undefined) candidate.foldMetrics = input.foldMetrics;
    if (input.gateVerdict !== undefined) candidate.gateVerdict = input.gateVerdict;
    const entryHash = computeRecordHash(candidate);

    const record: LedgerRecord = { ...candidate, prevHash, entryHash };
    await appendFile(ledgerPath, JSON.stringify(record) + '\n', 'utf8');
    return { ok: true, record };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Research ledger append failed (fail-safe)', 'ResearchLedger', {
      runId: input.runId,
      err: message,
    });
    return { ok: false, error: message };
  }
}

/** Read all ledger records, in order. Returns [] if the file does not exist. */
export async function readLedgerRecords(
  ledgerPath: string = DEFAULT_LEDGER_PATH,
): Promise<LedgerRecord[]> {
  try {
    const content = await readFile(ledgerPath, 'utf8');
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LedgerRecord);
  } catch {
    return [];
  }
}

/**
 * Verify the hash chain. Returns the index of the first broken link, or -1 if
 * the chain is intact (or empty). A broken link means a record was edited or
 * removed after it was written.
 */
export function verifyLedgerChain(records: LedgerRecord[]): number {
  let expectedPrev = '';
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    if (record.prevHash !== expectedPrev) return i;
    if (record.entryHash !== undefined) {
      const calculatedSelf = computeRecordHash(record);
      if (record.entryHash !== calculatedSelf) {
        return i + 1 < records.length ? i + 1 : i;
      }
    }
    expectedPrev = computeRecordHash(record);
  }
  return -1;
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

export async function queryLedgerRecords(
  filter: LedgerQueryFilter,
  ledgerPath: string = DEFAULT_LEDGER_PATH,
): Promise<LedgerRecord[]> {
  const records = await readLedgerRecords(ledgerPath);
  return filterLedgerRecords(records, filter);
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function readLastHash(ledgerPath: string): Promise<string> {
  const records = await readLedgerRecords(ledgerPath);
  if (records.length === 0) return '';
  return computeRecordHash(records[records.length - 1]!);
}