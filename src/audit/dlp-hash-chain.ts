/**
 * DLP Hash Chain
 * Tamper-evident linking: each audit row carries sha256(prevHash + rowData).
 * Pure functions — no I/O — easy to unit-test and run in Workers.
 */

import { createHash } from 'crypto';

/** Sentinel for the first row in the chain. */
export const CHAIN_GENESIS = '';

export interface ChainRow {
  id: string;
  subscriberId: string;
  url: string;
  method: string;
  action: string;
  patternId: string | null;
  payloadHash: string;
  prevHash: string;
  rowHash: string;
  ts: string;
}

/**
 * sha256 of arbitrary string input, returned as hex.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Canonical row-data string (deterministic field order).
 * Only stable fields are included; rowHash itself is excluded.
 */
function rowData(row: Omit<ChainRow, 'rowHash'>): string {
  return [
    row.id,
    row.subscriberId,
    row.url,
    row.method,
    row.action,
    row.patternId ?? '',
    row.payloadHash,
    row.prevHash,
    row.ts,
  ].join('|');
}

/**
 * Compute the rowHash for a new audit row.
 */
export function computeRowHash(row: Omit<ChainRow, 'rowHash'>): string {
  return sha256(row.prevHash + rowData(row));
}

/**
 * Build a complete ChainRow from partial data + previous hash.
 */
export function buildChainRow(
  partial: Omit<ChainRow, 'rowHash' | 'prevHash'>,
  prevHash: string,
): ChainRow {
  const base = { ...partial, prevHash };
  return { ...base, rowHash: computeRowHash(base) };
}

/**
 * Verify integrity of a sequence of chain rows.
 * Returns true only if every row's hash is consistent and links to the previous.
 */
export function verifyChain(rows: ChainRow[]): { valid: boolean; brokenAt?: number } {
  let prevHash = CHAIN_GENESIS;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Verify prevHash link
    if (row.prevHash !== prevHash) {
      return { valid: false, brokenAt: i };
    }

    // Verify rowHash integrity
    const expected = computeRowHash({
      id: row.id,
      subscriberId: row.subscriberId,
      url: row.url,
      method: row.method,
      action: row.action,
      patternId: row.patternId,
      payloadHash: row.payloadHash,
      prevHash: row.prevHash,
      ts: row.ts,
    });

    if (row.rowHash !== expected) {
      return { valid: false, brokenAt: i };
    }

    prevHash = row.rowHash;
  }

  return { valid: true };
}
