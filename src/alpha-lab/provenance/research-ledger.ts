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
import type { ResultClassName } from './run-card';

// ── Ledger Record ─────────────────────────────────────────────────────────────

export interface LedgerRecord {
  runId: string;
  configHash: string;
  resultClass: ResultClassName;
  strategyRef: string;
  /** ISO-8601 UTC timestamp of the ledger entry. */
  recordedAt: string;
  /** Gate outcomes: gateId -> passed. */
  gates: Record<string, boolean>;
  /** SHA-256 of the previous record's canonical JSON (empty string for the first). */
  prevHash: string;
}

export type LedgerWriteResult =
  | { ok: true; record: LedgerRecord }
  | { ok: false; error: string };

// ── Default path ──────────────────────────────────────────────────────────────

/** Default ledger location relative to the repo root. */
export const DEFAULT_LEDGER_PATH = join('data', 'research-ledger.jsonl');

// ── Hashing ───────────────────────────────────────────────────────────────────

function canonicalRecord(record: Omit<LedgerRecord, 'prevHash'>): string {
  return JSON.stringify({
    runId: record.runId,
    configHash: record.configHash,
    resultClass: record.resultClass,
    strategyRef: record.strategyRef,
    recordedAt: record.recordedAt,
    gates: record.gates,
  });
}

function hashRecord(record: Omit<LedgerRecord, 'prevHash'>): string {
  return createHash('sha256').update(canonicalRecord(record)).digest('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Append a record to the ledger. Reads the last line to compute `prevHash`,
 * then appends one JSON line. Fail-safe: never throws.
 */
export async function appendLedgerRecord(
  input: Omit<LedgerRecord, 'prevHash' | 'recordedAt'>,
  ledgerPath: string = DEFAULT_LEDGER_PATH,
): Promise<LedgerWriteResult> {
  try {
    await mkdir(dirname(ledgerPath), { recursive: true });
    const prevHash = await readLastHash(ledgerPath);
    const record: LedgerRecord = {
      runId: input.runId,
      configHash: input.configHash,
      resultClass: input.resultClass,
      strategyRef: input.strategyRef,
      recordedAt: new Date().toISOString(),
      gates: input.gates,
      prevHash,
    };
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
    const record = records[i];
    if (record.prevHash !== expectedPrev) return i;
    expectedPrev = hashRecord(record);
  }
  return -1;
}

// ── Internal ──────────────────────────────────────────────────────────────────

async function readLastHash(ledgerPath: string): Promise<string> {
  const records = await readLedgerRecords(ledgerPath);
  if (records.length === 0) return '';
  return hashRecord(records[records.length - 1]);
}