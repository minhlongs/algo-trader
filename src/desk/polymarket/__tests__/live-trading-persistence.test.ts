/**
 * Tests for LiveTradingPersistence — real-fs round-trip persistence of
 * orchestrator state snapshots and journal entries in a temp directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  LiveTradingPersistence,
  type OrchestratorStateSnapshot,
  type JournalEntry,
} from '../live-trading-persistence';

describe('LiveTradingPersistence', () => {
  let dir: string;
  let log: ReturnType<typeof vi.fn>;
  let persistence: LiveTradingPersistence;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ltp-test-'));
    log = vi.fn();
    persistence = new LiveTradingPersistence(dir, log);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('constructor & ensureDir', () => {
    it('creates a nested state dir that does not exist yet', async () => {
      const nested = join(dir, 'a/b/c');
      const p = new LiveTradingPersistence(nested, log);
      await p.ensureDir();
      // A write into it proves the directory exists
      await p.persistState(makeSnapshot());
      await expect(readFile(join(nested, 'orchestrator-state.json'), 'utf-8')).resolves.toBeTruthy();
    });

    it('is idempotent when dir already exists', async () => {
      await persistence.ensureDir();
      await expect(persistence.ensureDir()).resolves.not.toThrow();
    });
  });

  describe('persistState / restoreState round-trip', () => {
    it('saves and restores a snapshot unchanged', async () => {
      const snap = makeSnapshot({
        positions: [
          { market: 'mkt-1', outcome: 'Yes', size: 10, avgEntryPrice: 0.5, currentPrice: 0.55, unrealizedPnl: 0.5 },
          { market: 'mkt-2', outcome: 'No', size: 20, avgEntryPrice: 0.4, currentPrice: 0.38, unrealizedPnl: 0.4 },
        ],
        paperStats: { 'Claude-Fable': { paperTrades: 3, paperPnl: 1.25 } },
      });

      await persistence.persistState(snap);

      const restored = await persistence.restoreState();
      expect(restored).toEqual(snap);
    });

    it('returns null and logs when state file missing', async () => {
      const result = await persistence.restoreState();
      expect(result).toBeNull();
      expect(hasLogContaining(log, 'Failed to restore state')).toBe(true);
    });

    it('returns null and logs when state file is corrupt JSON', async () => {
      await persistence.ensureDir();
      await writeFile(join(dir, 'orchestrator-state.json'), 'not-json{', 'utf-8');
      const result = await persistence.restoreState();
      expect(result).toBeNull();
      expect(hasLogContaining(log, 'Failed to restore state')).toBe(true);
    });

    it('logs but does not throw when persist fails (path blocked by a file)', async () => {
      const badDir = join(dir, 'not-a-dir');
      await writeFile(badDir, 'file-acts-as-dir', 'utf-8'); // path already exists as a FILE
      const p = new LiveTradingPersistence(badDir, log);
      await expect(p.persistState(makeSnapshot())).resolves.not.toThrow();
      expect(hasLogContaining(log, 'Failed to persist state')).toBe(true);
    });
  });

  describe('buildSnapshot', () => {
    it('builds versioned snapshot with timestamp and Map→Record conversion', () => {
      const snap = persistence.buildSnapshot({
        capitalUsdc: 1000,
        allocatedUsdc: 200,
        pnlUsdc: 12.5,
        positions: [{ market: 'm', outcome: 'Yes', size: 5, avgEntryPrice: 0.5, currentPrice: 0.6, unrealizedPnl: 0.5 }],
        paperStats: new Map([['s1', { paperTrades: 1, paperPnl: 0.5 }], ['s2', { paperTrades: 2, paperPnl: -0.25 }]]),
        tradeCount: 42,
      });
      expect(snap.version).toBe(1);
      expect(snap.timestamp).toBeGreaterThan(0);
      expect(snap.paperStats).toEqual({
        s1: { paperTrades: 1, paperPnl: 0.5 },
        s2: { paperTrades: 2, paperPnl: -0.25 },
      });
      expect(snap.tradeCount).toBe(42);
      expect(snap.positions).toHaveLength(1);
    });
  });

  describe('appendJournal / getJournal round-trip', () => {
    it('appends entries and reads them back in order', async () => {
      const e1: JournalEntry = { ts: 1, type: 'start', details: 'started' };
      const e2: JournalEntry = { ts: 2, type: 'trade', details: 'bought' };
      await persistence.appendJournal(e1);
      await persistence.appendJournal(e2);
      const journal = await persistence.getJournal();
      expect(journal).toEqual([e1, e2]);
    });

    it('returns empty array when journal file missing', async () => {
      await expect(persistence.getJournal()).resolves.toEqual([]);
    });

    it('returns empty array and swallows JSON parse errors on corrupt lines', async () => {
      await persistence.ensureDir();
      await writeFile(join(dir, 'orchestrator-journal.jsonl'), 'not-json\n', 'utf-8');
      await expect(persistence.getJournal()).resolves.toEqual([]);
    });
  });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeSnapshot(
  overrides: Partial<OrchestratorStateSnapshot> = {},
): OrchestratorStateSnapshot {
  return {
    version: 1,
    timestamp: Date.now(),
    capitalUsdc: 1000,
    allocatedUsdc: 200,
    pnlUsdc: 12.5,
    positions: [],
    paperStats: {},
    tradeCount: 1,
    ...overrides,
  };
}

function hasLogContaining(
  log: ReturnType<typeof vi.fn>,
  fragment: string,
): boolean {
  return (log.mock.calls as Array<[string, string]>).some(([msg]) => msg.includes(fragment));
}