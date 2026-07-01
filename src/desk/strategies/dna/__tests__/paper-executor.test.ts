/**
 * Tests for paper-executor.ts (Phase 03).
 * Verifies: emit, journal, getPaperJournal, clearPaperJournal, FIFO eviction.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { onDnaEvent } from '../orchestrator';
import {
  executePaperConsensus,
  getPaperJournal,
  clearPaperJournal,
  type PaperJournalEntry,
} from '../paper-executor';
import type { ConsensusSignal } from '../multi-tf-types';

const mockSignal = (overrides: Partial<ConsensusSignal> = {}): ConsensusSignal => ({
  traceId: 'trace-1',
  action: 'enter_long',
  confidence: 0.85,
  regime: 'trending_up',
  reason: 'Bullish multi-TF',
  emittedAt: 1_700_000_000_000,
  tfSignals: [
    { tf: '1d', action: 'enter_long', confidence: 0.9 },
    { tf: '1h', action: 'enter_long', confidence: 0.8 },
  ],
  ...overrides,
});

describe('paper-executor', () => {
  afterEach(() => {
    clearPaperJournal();
    vi.clearAllTimers();
  });

  it('returns null and emits nothing when signal is null', () => {
    const emitted: any[] = [];
    const unsub = onDnaEvent((e) => emitted.push(e));
    const out = executePaperConsensus(null);
    expect(out).toBeNull();
    expect(emitted).toHaveLength(0);
    unsub();
  });

  it('returns null and emits nothing when action is hold', () => {
    const holdSignal = mockSignal({ action: 'hold' });
    const emitted: any[] = [];
    const unsub = onDnaEvent((e) => emitted.push(e));
    const out = executePaperConsensus(holdSignal);
    expect(out).toBeNull();
    expect(emitted).toHaveLength(0);
    expect(getPaperJournal()).toHaveLength(0);
    unsub();
  });

  it('returns a PaperJournalEntry and emits paper_executed on enter_long', () => {
    const emitted: any[] = [];
    const unsub = onDnaEvent((e) => emitted.push(e));
    const sig = mockSignal({ action: 'enter_long' });
    const out = executePaperConsensus(sig, { getFillPrice: () => 65_432 });

    expect(out).not.toBeNull();
    expect(out!.action).toBe('enter_long');
    expect(out!.traceId).toBe('trace-1');
    expect(out!.confidence).toBeCloseTo(0.85);
    expect(out!.regime).toBe('trending_up');
    expect(out!.executedBy).toBe('paper');
    expect(out!.fillPrice).toBe(65_432);
    expect(typeof out!.id).toBe('string');
    expect(out!.id.startsWith('paper-')).toBe(true);
    expect(out!.tfSignals).toHaveLength(2);

    const journal = getPaperJournal();
    expect(journal).toHaveLength(1);
    expect(journal[0].id).toBe(out!.id);

    const evts = emitted.filter((e) => e.type === 'paper_executed');
    expect(evts).toHaveLength(1);
    expect(evts[0].entry.id).toBe(out!.id);
    unsub();
  });

  it('records enter_short correctly', () => {
    const out = executePaperConsensus(
      mockSignal({ action: 'enter_short', confidence: 0.6 }),
    );
    expect(out).not.toBeNull();
    expect(out!.action).toBe('enter_short');
    expect(getPaperJournal()).toHaveLength(1);
  });

  it('evicts oldest when maxEntries is reached', () => {
    clearPaperJournal();
    for (let i = 0; i < 6; i++) {
      executePaperConsensus(mockSignal({ traceId: `t-${i}` }), {
        maxEntries: 3,
      });
    }
    const journal = getPaperJournal();
    expect(journal).toHaveLength(3);
    expect(journal.map((j) => j.traceId)).toEqual(['t-3', 't-4', 't-5']);
  });

  it('clearPaperJournal empties the store', () => {
    executePaperConsensus(mockSignal());
    executePaperConsensus(mockSignal({ traceId: 'trace-2' }));
    expect(getPaperJournal()).toHaveLength(2);
    clearPaperJournal();
    expect(getPaperJournal()).toHaveLength(0);
  });

  it('fillPrice defaults to null when no getFillPrice is provided', () => {
    const out = executePaperConsensus(mockSignal());
    expect(out!.fillPrice).toBeNull();
  });
});
