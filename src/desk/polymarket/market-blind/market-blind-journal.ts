import { createHash } from 'node:crypto';

export class MarketBlindIntegrityError extends Error {
  constructor(message: string) { super(`MARKET_BLIND_INTEGRITY_ERROR: ${message}`); this.name = 'MarketBlindIntegrityError'; }
}
export interface MarketBlindCheckpoint {
  version: 1; recordCount: number; headHash: string; sealHash: string;
}
/** Must be maintained independently of the journal, never reconstructed from its surviving prefix. */
export interface MarketBlindCheckpointStore {
  readCheckpoint(): MarketBlindCheckpoint | null;
  compareAndSwap(expected: MarketBlindCheckpoint | null, next: MarketBlindCheckpoint): void;
}
export interface MarketBlindAppendOnlyStore {
  appendLine(line: string): void;
  readAllLines(): string[];
  checkpointStore?: MarketBlindCheckpointStore;
  /** Compare head, append durably, and advance checkpoint under one exclusive writer boundary. */
  appendSealed?(line: string, expected: MarketBlindCheckpoint | null, next: MarketBlindCheckpoint): void;
}
export interface MarketBlindJournalRecord {
  seq: number; kind: string; prevHash: string; entryHash: string; payload: unknown;
}
export const GENESIS_HASH = '0'.repeat(64);
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const recordHash = (seq: number, kind: string, prevHash: string, payload: unknown): string => hash([seq, kind, prevHash, payload]);
export function checkpointFor(recordCount: number, headHash: string): MarketBlindCheckpoint {
  return { version: 1, recordCount, headHash, sealHash: hash([1, recordCount, headHash]) };
}
export function sameCheckpoint(a: MarketBlindCheckpoint | null, b: MarketBlindCheckpoint | null): boolean {
  return a === null || b === null ? a === b : a.version === b.version && a.recordCount === b.recordCount && a.headHash === b.headHash && a.sealHash === b.sealHash;
}
export function assertCheckpoint(value: unknown): asserts value is MarketBlindCheckpoint {
  const c = value as Partial<MarketBlindCheckpoint> | null;
  if (!c || c.version !== 1 || !Number.isSafeInteger(c.recordCount) || c.recordCount! < 0 || typeof c.headHash !== 'string'
    || !/^[a-f0-9]{64}$/.test(c.headHash) || c.sealHash !== checkpointFor(c.recordCount!, c.headHash).sealHash) {
    throw new MarketBlindIntegrityError('Invalid terminal checkpoint seal');
  }
}
export function parseJournal(lines: readonly string[]): MarketBlindJournalRecord[] {
  const records: MarketBlindJournalRecord[] = [];
  let prevHash = GENESIS_HASH;
  for (const [seq, line] of lines.entries()) {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new MarketBlindIntegrityError(`Malformed JSONL at line ${seq}`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MarketBlindIntegrityError(`Invalid record at line ${seq}`);
    const r = value as Partial<MarketBlindJournalRecord>;
    if (r.seq !== seq || r.prevHash !== prevHash || typeof r.kind !== 'string' || !r.payload || typeof r.payload !== 'object'
      || r.entryHash !== recordHash(seq, r.kind, prevHash, r.payload)) throw new MarketBlindIntegrityError(`Record sequence/seal mismatch at line ${seq}`);
    records.push(r as MarketBlindJournalRecord);
    prevHash = r.entryHash;
  }
  return records;
}
export function verifyStoreSnapshot(store: MarketBlindAppendOnlyStore): { records: MarketBlindJournalRecord[]; checkpoint: MarketBlindCheckpoint | null } {
  const records = parseJournal(store.readAllLines());
  const checkpoint = store.checkpointStore?.readCheckpoint() ?? null;
  if (checkpoint !== null) {
    assertCheckpoint(checkpoint);
    if (!sameCheckpoint(checkpoint, checkpointFor(records.length, records.at(-1)?.entryHash ?? GENESIS_HASH))) {
      throw new MarketBlindIntegrityError('Terminal checkpoint/count mismatch (truncation or incomplete append)');
    }
  } else if (records.length > 0 && store.checkpointStore) {
    throw new MarketBlindIntegrityError('Existing ledger has no independently retained checkpoint; migration required');
  }
  return { records, checkpoint };
}

/** An uncertain write poisons the instance; no retry or implicit crash repair is permitted. */
export class MarketBlindJournal {
  private count: number;
  private head: string;
  private checkpoint: MarketBlindCheckpoint | null;
  private failed = false;
  readonly records: readonly MarketBlindJournalRecord[];
  constructor(private readonly store: MarketBlindAppendOnlyStore) {
    const snapshot = verifyStoreSnapshot(store);
    this.records = snapshot.records;
    this.count = snapshot.records.length;
    this.head = snapshot.records.at(-1)?.entryHash ?? GENESIS_HASH;
    this.checkpoint = snapshot.checkpoint;
  }
  recordCount(): number { return this.count; }
  poison(): void { this.failed = true; }
  assertHealthy(): void {
    if (this.failed) throw new MarketBlindIntegrityError('Ledger is quarantined after an uncertain write or integrity failure');
  }
  verify(): boolean {
    if (this.failed) return false;
    try {
      const s = verifyStoreSnapshot(this.store);
      if (s.records.length !== this.count || (s.records.at(-1)?.entryHash ?? GENESIS_HASH) !== this.head || !sameCheckpoint(s.checkpoint, this.checkpoint)) {
        throw new MarketBlindIntegrityError('Store changed outside this ledger instance');
      }
      return true;
    } catch { this.failed = true; return false; }
  }
  integrityVerified(): boolean { return this.verify() && this.checkpoint !== null && !!this.store.appendSealed; }
  append(kind: string, payload: unknown): void {
    this.assertHealthy();
    if (!this.verify()) throw new MarketBlindIntegrityError('Stale or damaged store before append');
    const entryHash = recordHash(this.count, kind, this.head, payload);
    const line = JSON.stringify({ seq: this.count, kind, prevHash: this.head, entryHash, payload });
    const next = checkpointFor(this.count + 1, entryHash);
    try {
      if (this.store.appendSealed) this.store.appendSealed(line, this.checkpoint, next);
      else {
        // Legacy single-writer diagnostic ports cannot assert empirical integrity.
        this.store.appendLine(line);
        this.store.checkpointStore?.compareAndSwap(this.checkpoint, next);
      }
      const s = verifyStoreSnapshot(this.store);
      if (s.records.length !== next.recordCount || s.records.at(-1)?.entryHash !== next.headHash
        || (this.store.checkpointStore && !sameCheckpoint(s.checkpoint, next))) throw new MarketBlindIntegrityError('Append verification failed');
      this.count += 1; this.head = entryHash; this.checkpoint = s.checkpoint;
    } catch (error) { this.failed = true; throw error; }
  }
}

export function createInMemoryAppendOnlyStore(): MarketBlindAppendOnlyStore {
  const lines: string[] = [];
  let checkpoint: MarketBlindCheckpoint | null = null;
  const checkpointStore: MarketBlindCheckpointStore = {
    readCheckpoint: () => checkpoint ? { ...checkpoint } : null,
    compareAndSwap(expected, next): void {
      if (!sameCheckpoint(checkpoint, expected)) throw new MarketBlindIntegrityError('Concurrent checkpoint update');
      assertCheckpoint(next); checkpoint = Object.freeze({ ...next });
    },
  };
  return {
    checkpointStore,
    readAllLines: () => [...lines],
    appendLine: (line) => { lines.push(line); },
    appendSealed(line, expected, next): void {
      if (!sameCheckpoint(checkpoint, expected)) throw new MarketBlindIntegrityError('Concurrent writer');
      lines.push(line);
      checkpointStore.compareAndSwap(expected, next);
    },
  };
}
