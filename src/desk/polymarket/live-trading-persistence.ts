/**
 * Live Trading Orchestrator — State Persistence
 *
 * Handles save/restore of orchestrator state to disk (JSON files).
 * Enables state recovery after restarts.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorStateSnapshot {
  version: number;
  timestamp: number;
  capitalUsdc: number;
  allocatedUsdc: number;
  pnlUsdc: number;
  positions: PositionSnapshot[];
  paperStats: Record<string, { paperTrades: number; paperPnl: number }>;
  tradeCount: number;
}

export interface PositionSnapshot {
  market: string;
  outcome: 'Yes' | 'No';
  size: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
}

export interface JournalEntry {
  ts: number;
  type: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

const STATE_VERSION = 1;

export class LiveTradingPersistence {
  private stateDir: string;

  constructor(
    stateDir: string,
    private readonly log: (msg: string, ctx: string) => void,
  ) {
    this.stateDir = stateDir;
  }

  /** Ensure the state directory exists. */
  async ensureDir(): Promise<void> {
    await mkdir(this.stateDir, { recursive: true });
  }

  /** Build full path for a named state file. */
  private filePath(name: string): string {
    return join(this.stateDir, name);
  }

  /**
   * Persist an orchestrator state snapshot to disk.
   * Silently logs on failure — persistence is best-effort.
   */
  async persistState(data: OrchestratorStateSnapshot): Promise<void> {
    try {
      await this.ensureDir();
      const json = JSON.stringify(data, null, 2);
      await writeFile(this.filePath('orchestrator-state.json'), json, 'utf-8');
    } catch (err) {
      this.log(`Failed to persist state: ${String(err)}`, 'Orchestrator');
    }
  }

  /**
   * Restore orchestrator state from disk.
   * Returns null if file missing or corrupt.
   */
  async restoreState(): Promise<OrchestratorStateSnapshot | null> {
    try {
      const raw = await readFile(this.filePath('orchestrator-state.json'), 'utf-8');
      return JSON.parse(raw) as OrchestratorStateSnapshot;
    } catch (err) {
      this.log(`Failed to restore state — starting fresh: ${String(err)}`, 'Orchestrator');
      return null;
    }
  }

  /** Build a snapshot from live orchestrator fields. */
  buildSnapshot(opts: {
    capitalUsdc: number;
    allocatedUsdc: number;
    pnlUsdc: number;
    positions: PositionSnapshot[];
    paperStats: Map<string, { paperTrades: number; paperPnl: number }>;
    tradeCount: number;
  }): OrchestratorStateSnapshot {
    return {
      version: STATE_VERSION,
      timestamp: Date.now(),
      capitalUsdc: opts.capitalUsdc,
      allocatedUsdc: opts.allocatedUsdc,
      pnlUsdc: opts.pnlUsdc,
      positions: opts.positions,
      paperStats: Object.fromEntries(opts.paperStats),
      tradeCount: opts.tradeCount,
    };
  }

  /** Append a journal entry for debugging / audit. */
  async appendJournal(entry: JournalEntry): Promise<void> {
    try {
      await this.ensureDir();
      const file = this.filePath('orchestrator-journal.jsonl');
      await writeFile(file, JSON.stringify(entry) + '\n', { flag: 'a' });
    } catch {
      // journal is best-effort — silently ignore
    }
  }

  /** Read all journal entries. */
  async getJournal(): Promise<JournalEntry[]> {
    try {
      const raw = await readFile(this.filePath('orchestrator-journal.jsonl'), 'utf-8');
      return raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as JournalEntry);
    } catch {
      return [];
    }
  }
}
