/**
 * Live Trading Journal
 *
 * Persistent audit trail for live trading: fills, positions, daily P&L, and
 * circuit breaker events. Uses append-only JSONL for fills (immutable audit log)
 * and atomic JSON for mutable state (positions, P&L).
 *
 * All data at ~/.cashclaw/ — survives process restarts and PM2 reloads.
 */

import {
  cashclawPath,
  appendJsonl,
  readJsonl,
  readJsonState,
} from '../../shared/persistence/file-store';
import { logger } from '../../shared/utils/logger';
import { writeJson } from '../../shared/persistence/persistent-store';
import type { FilledOrder } from './live-position-tracker';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  timestamp: number;
  type: 'fill' | 'circuit_trip' | 'circuit_reset' | 'daily_reset' | 'guard_reject';
  data: Record<string, unknown>;
}

export interface DailyPnlState {
  date: string; // YYYY-MM-DD
  realizedPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
}

// ── Paths ──────────────────────────────────────────────────────────────────────

const TRADES_FILE = cashclawPath('live-trades.jsonl');
const POSITIONS_FILE = cashclawPath('live-positions.json');
const PNL_FILE = cashclawPath('live-pnl.json');
const JOURNAL_FILE = cashclawPath('live-journal.jsonl');

// ── Journal ────────────────────────────────────────────────────────────────────

export class LiveTradingJournal {
  private today: string;

  constructor() {
    this.today = this.dateKey();
  }

  // ── Fills ──────────────────────────────────────────────────────────────────

  /** Persist a filled order to the immutable trade log */
  recordFill(fill: FilledOrder): void {
    appendJsonl(TRADES_FILE, { ...fill, recordedAt: Date.now() });
  }

  /** Load all historical fills */
  loadFills(): Promise<FilledOrder[]> {
    return readJsonl<FilledOrder>(TRADES_FILE) ?? Promise.resolve([]);
  }

  /** Count fills for a given date */
  async countFillsForDate(date: string): Promise<number> {
    const fills = await readJsonl<{ filledAt: number }>(TRADES_FILE);
    return fills.filter((f) => this.dateKey(new Date(f.filledAt)) === date).length;
  }

  // ── Positions ──────────────────────────────────────────────────────────────

  /** Save current positions snapshot */
  savePositions(positions: unknown[]): void {
    writeJson(POSITIONS_FILE, positions);
  }

  /** Load last saved positions snapshot */
  loadPositions<T>(): T[] {
    return readJsonState<T[]>(POSITIONS_FILE) ?? [];
  }

  // ── P&L ────────────────────────────────────────────────────────────────────

  /** Save daily P&L state */
  saveDailyPnl(state: DailyPnlState): void {
    writeJson(PNL_FILE, state);
  }

  /** Load daily P&L state */
  loadDailyPnl(): DailyPnlState | null {
    const state = readJsonState<DailyPnlState>(PNL_FILE);
    if (!state) return null;
    // Reset if it's a new day
    if (state.date !== this.dateKey()) return null;
    return state;
  }

  // ── Journal events ─────────────────────────────────────────────────────────

  /** Record a non-fill event (circuit trip, daily reset, etc.) */
  recordEvent(type: JournalEntry['type'], data: Record<string, unknown> = {}): void {
    const entry: JournalEntry = { timestamp: Date.now(), type, data };
    appendJsonl(JOURNAL_FILE, entry);
    logger.info(`Journal: ${type}`, 'LiveTradingJournal', data);
  }

  /** Load all journal events */
  loadEvents(): Promise<JournalEntry[]> {
    return readJsonl<JournalEntry>(JOURNAL_FILE);
  }

  /** Load events of a specific type */
  async loadEventsByType(type: JournalEntry['type']): Promise<JournalEntry[]> {
    const events = await this.loadEvents();
    return events.filter((e) => e.type === type);
  }

  // ── Day rollover ───────────────────────────────────────────────────────────

  /** Check if day has changed and return new date key if so */
  checkDayRollover(): string | null {
    const newDay = this.dateKey();
    if (newDay !== this.today) {
      const old = this.today;
      this.today = newDay;
      return old; // returns previous day for archive reference
    }
    return null;
  }

  getToday(): string {
    return this.today;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  /** Get total trade count and P&L across all time */
  async getLifetimeStats(): Promise<{ totalTrades: number; totalFills: number }> {
    const fills = await this.loadFills();
    return {
      totalTrades: fills.length,
      totalFills: fills.length,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private dateKey(d: Date = new Date()): string {
    return d.toISOString().slice(0, 10);
  }
}
