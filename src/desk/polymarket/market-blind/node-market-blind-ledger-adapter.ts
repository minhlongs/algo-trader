/** Local-filesystem adapter. Stale crash locks require operator investigation, never automatic stealing. */
import { closeSync, existsSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MarketBlindIntegrityError, assertCheckpoint, sameCheckpoint, verifyStoreSnapshot, type MarketBlindAppendOnlyStore, type MarketBlindCheckpoint, type MarketBlindCheckpointStore } from './market-blind-journal';

function canonicalPath(value: string): string {
  if (!value.trim()) throw new MarketBlindIntegrityError('A non-empty storage path is required');
  const path = resolve(value.trim());
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new MarketBlindIntegrityError('Symbolic storage files are unsupported');
  return join(realpathSync(dirname(path)), basename(path));
}
function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function writeAll(fd: number, text: string): void {
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new MarketBlindIntegrityError('Incomplete write');
    offset += written;
  }
}

/** Separate checkpoint location may be supplied; default is a sidecar, not an off-host trust anchor. */
export function createNodeJsonlAppendStore(filePath: string, checkpointPath = `${filePath}.checkpoint.json`): MarketBlindAppendOnlyStore {
  const journalPath = canonicalPath(filePath), headPath = canonicalPath(checkpointPath);
  if (journalPath === headPath || (existsSync(journalPath) && existsSync(headPath)
    && lstatSync(journalPath).dev === lstatSync(headPath).dev && lstatSync(journalPath).ino === lstatSync(headPath).ino)) {
    throw new MarketBlindIntegrityError('Checkpoint must be separate from ledger');
  }
  const lockPaths = [`${journalPath}.writer-lock`, `${headPath}.writer-lock`].sort();
  function withLock<T>(action: () => T): T {
    const held: string[] = [];
    try {
      for (const lockPath of lockPaths) {
        try { mkdirSync(lockPath, { mode: 0o700 }); held.push(lockPath); } catch (error) {
          throw new MarketBlindIntegrityError(`Exclusive writer lock unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return action();
    } finally { for (const lockPath of held.reverse()) rmdirSync(lockPath); }
  }
  function readCheckpoint(): MarketBlindCheckpoint | null {
    if (!existsSync(headPath)) return null;
    let value: unknown;
    try { value = JSON.parse(readFileSync(headPath, 'utf8')); } catch {
      throw new MarketBlindIntegrityError('Malformed terminal checkpoint');
    }
    assertCheckpoint(value);
    return value;
  }
  function swapCheckpoint(expected: MarketBlindCheckpoint | null, next: MarketBlindCheckpoint): void {
    assertCheckpoint(next);
    if (!sameCheckpoint(readCheckpoint(), expected)) throw new MarketBlindIntegrityError('Concurrent checkpoint change');
    const temp = `${headPath}.${randomUUID()}.tmp`;
    let created = false;
    try {
      const fd = openSync(temp, 'wx', 0o600); created = true;
      try { writeAll(fd, `${JSON.stringify(next)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temp, headPath); created = false;
      syncDirectory(dirname(headPath));
    } finally { if (created) unlinkSync(temp); }
  }
  const checkpointStore: MarketBlindCheckpointStore = {
    readCheckpoint,
    compareAndSwap: (expected, next) => withLock(() => swapCheckpoint(expected, next)),
  };
  const store: MarketBlindAppendOnlyStore = {
    checkpointStore,
    appendLine(): void { throw new MarketBlindIntegrityError('Unsealed append unsupported; use appendSealed'); },
    readAllLines(): string[] {
      if (lockPaths.some((path) => existsSync(path))) throw new MarketBlindIntegrityError('Writer in progress or unrecovered crash lock');
      return readLines();
    },
    appendSealed(line, expected, next): void {
      if (line.includes('\n') || line.includes('\r')) throw new MarketBlindIntegrityError('JSONL embedded newline');
      withLock(() => {
        const snapshot = verifyStoreSnapshot({ readAllLines: readLines, appendLine: store.appendLine, checkpointStore });
        if (!sameCheckpoint(snapshot.checkpoint, expected)) throw new MarketBlindIntegrityError('Stale writer checkpoint');
        const value: unknown = JSON.parse(line);
        const record = value as { seq?: unknown; prevHash?: unknown; entryHash?: unknown };
        if (!record || record.seq !== snapshot.records.length || record.prevHash !== (snapshot.records.at(-1)?.entryHash ?? '0'.repeat(64))
          || next.recordCount !== snapshot.records.length + 1 || next.headHash !== record.entryHash) throw new MarketBlindIntegrityError('Stale writer record');
        const fd = openSync(journalPath, 'a', 0o600);
        try { fchmodSync(fd, 0o600); writeAll(fd, `${line}\n`); fsyncSync(fd); } finally { closeSync(fd); }
        syncDirectory(dirname(journalPath));
        swapCheckpoint(expected, next);
      });
    },
  };
  function readLines(): string[] {
    if (!existsSync(journalPath)) return [];
    const raw = readFileSync(journalPath, 'utf8');
    if (!raw) return [];
    if (!raw.endsWith('\n')) throw new MarketBlindIntegrityError('Unterminated/partial JSONL append');
    return raw.slice(0, -1).split('\n');
  }
  return store;
}
