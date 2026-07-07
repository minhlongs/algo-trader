/**
 * Paper Trading Execution Layer (Phase 03)
 *
 * Receives a ConsensusSignal and:
 *  - emits a typed `paper_executed` event via onDnaEvent
 *  - writes a DnaJournalEntry into a paper journal store (in-memory by default)
 *  - exposes a getter for latest paper trades (for admin endpoint / Phase 4)
 *
 * Side-effect policy:
 *  - paperMode=true  → executor fires (simulated fill)
 *  - paperMode=false → executor is no-op (conservative default)
 */

import { emitDnaEvent } from'./orchestrator';
import type { ConsensusSignal, TfId, MarketRegime, PaperJournalEntry, DnaJournalEntry } from'./multi-tf-types';


// ─── In-memory journal store (replace with a real DB in future) ───────────────

const _journal: PaperJournalEntry[] = [];

export function getPaperJournal(): PaperJournalEntry[] {
  return [..._journal];
}

export function clearPaperJournal(): void {
  _journal.length = 0;
}

// ─── Executor options ──────────────────────────────────────────────────────────

export interface PaperExecutorOptions {
  /** Max entries to retain in-memory (FIFO eviction). 0 = unlimited. */
  maxEntries?: number;
  /**
   * Optional fill price getter — injected in tests to make outcomes
   * deterministic, ignored in production (use null for `fillPrice = null`).
   */
  getFillPrice?: () => number | null;
}

// ─── Core executor ─────────────────────────────────────────────────────────────

/**
 * Process a consensus signal and record a paper trade.
 *
 * @returns PaperJournalEntry on action ≠ hold, null otherwise.
 */
export function executePaperConsensus(
  signal: ConsensusSignal | null,
  opts: PaperExecutorOptions = {},
): PaperJournalEntry | null {
  if (!signal) return null;

  if (signal.action === 'hold') return null;

  const fillPrice = opts.getFillPrice?.() ?? null;

  const entry: PaperJournalEntry = {
    id: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    traceId: signal.traceId,
    at: signal.emittedAt,
    action: signal.action,
    confidence: signal.confidence,
    regime: signal.regime,
    reason: signal.reason,
    tfSignals: signal.tfSignals.map((s) => ({
      tf: s.tf,
      action: s.action,
      confidence: s.confidence,
    })),
    fillPrice,
    executedBy: 'paper',
  source: 'dna-paper',
  };

  _journal.push(entry);

  if (opts.maxEntries && _journal.length > opts.maxEntries) {
    _journal.splice(0, _journal.length - opts.maxEntries);
  }

  emitDnaEvent({
    type: 'paper_executed',
    entry,
  });

  return entry;
}

// ─── Re-export types consumers may want ──────────────────────────────────────

export { ConsensusAction, MarketRegime, TfId } from'./multi-tf-types';
