/**
 * Tests for journal-writer.ts.
 *
 * Covers:
 *  - deriveDecision: paperMode short-circuits; hold is rejected in live
 *  - deriveExecutedBy: paperMode short-circuits; hold is none in live
 *  - eventToParams: gates on ev.type and c; paperMode=false hardcoded;
 *    tfSignalsJson JSON-strifies; nulls for optional fields
 *  - writeJournalEntry: invokes `query` with 16 ordered params; on error logs and swallows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveDecision,
  deriveExecutedBy,
  eventToParams,
  writeJournalEntry,
} from '../journal-writer';

// Mock the postgres client, logger, and prometheus counter
vi.mock('../../../../shared/db/postgres-client', () => ({
  query: vi.fn(),
}));
vi.mock('../../../../shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));
vi.mock('../../../../platform/middleware/prometheus-metrics', () => ({
  journalWriteErrorsTotal: {
    inc: vi.fn(),
  },
}));

import { query as pgQuery } from '../../../../shared/db/postgres-client';
import { logger } from '../../../../shared/utils/logger';
import { journalWriteErrorsTotal } from '../../../../platform/middleware/prometheus-metrics';

const q = vi.mocked(pgQuery);
const logError = vi.mocked(logger.error);
const incCounter = vi.mocked(journalWriteErrorsTotal.inc);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function consensus(overrides: {
  action?: 'enter_long' | 'enter_short' | 'hold';
  confidence?: number;
  weightedBullScore?: number;
  weightedBearScore?: number;
  regime?: string;
  emittedAt?: number;
  reason?: string;
  tfSignals?: any[];
} = {}): any {
  return {
    action: overrides.action ?? 'enter_long',
    confidence: overrides.confidence ?? 0.8,
    weightedBullScore: overrides.weightedBullScore ?? 0.9,
    weightedBearScore: overrides.weightedBearScore ?? 0.1,
    regime: overrides.regime ?? 'trending_up',
    emittedAt: overrides.emittedAt ?? 1_700_000_000_000,
    reason: overrides.reason ?? 'consensus=long agreement=3/3',
    tfSignals: overrides.tfSignals ?? [],
  };
}

function consensusEvent(signalOverrides: Parameters<typeof consensus>[0] = {}) {
  return {
    type: 'consensus_computed' as const,
    signal: consensus(signalOverrides),
  };
}

// ─── deriveDecision tests ────────────────────────────────────────────────────

describe('deriveDecision', () => {
  it('paperMode => paper_only regardless of action', () => {
    expect(deriveDecision(consensus({ action: 'enter_long' }), true)).toBe('paper_only');
    expect(deriveDecision(consensus({ action: 'hold' }), true)).toBe('paper_only');
    expect(deriveDecision(consensus({ action: 'enter_short' }), true)).toBe('paper_only');
  });

  it('live mode + hold => rejected_low_confidence', () => {
    expect(deriveDecision(consensus({ action: 'hold' }), false)).toBe(
      'rejected_low_confidence',
    );
  });

  it('live mode + enter_long => executed', () => {
    expect(deriveDecision(consensus({ action: 'enter_long' }), false)).toBe('executed');
  });

  it('live mode + enter_short => executed', () => {
    expect(deriveDecision(consensus({ action: 'enter_short' }), false)).toBe('executed');
  });
});

// ─── deriveExecutedBy tests ──────────────────────────────────────────────────

describe('deriveExecutedBy', () => {
  it('paperMode => paper regardless of action', () => {
    expect(deriveExecutedBy(consensus({ action: 'enter_long' }), true)).toBe('paper');
    expect(deriveExecutedBy(consensus({ action: 'hold' }), true)).toBe('paper');
    expect(deriveExecutedBy(consensus({ action: 'enter_short' }), true)).toBe('paper');
  });

  it('live mode + hold => none', () => {
    expect(deriveExecutedBy(consensus({ action: 'hold' }), false)).toBe('none');
  });

  it('live mode + non-hold => live', () => {
    expect(deriveExecutedBy(consensus({ action: 'enter_long' }), false)).toBe('live');
    expect(deriveExecutedBy(consensus({ action: 'enter_short' }), false)).toBe('live');
  });
});

// ─── eventToParams tests ─────────────────────────────────────────────────────

describe('eventToParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when ev.type is not consensus_computed', () => {
    expect(eventToParams({ type: 'engine_started' } as any)).toBeNull();
    expect(eventToParams({ type: 'error' } as any)).toBeNull();
  });

  it('returns null when ev.signal is missing', () => {
    expect(eventToParams({ type: 'consensus_computed', signal: undefined } as any)).toBeNull();
    expect(eventToParams({ type: 'consensus_computed', signal: null } as any)).toBeNull();
  });

  it('maps consensus_computed to a partial DnaJournalEntry', () => {
    const sig = consensus({
      action: 'enter_long',
      confidence: 0.77,
      weightedBullScore: 0.85,
      weightedBearScore: 0.15,
      regime: 'trending_up',
      emittedAt: 1_234_567_890_000,
      reason: 'tf-up',
      tfSignals: [{ tf: '1d', action: 'bull', confidence: 0.9 }],
    });
    const ev = { type: 'consensus_computed' as const, signal: sig };
    const result = eventToParams(ev);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('enter_long');
    expect(result!.decision).toBe('executed');
    expect(result!.confidence).toBe(0.77);
    expect(result!.weightedBullScore).toBe(0.85);
    expect(result!.weightedBearScore).toBe(0.15);
    expect(result!.regime).toBe('trending_up');
    expect(result!.timestamp).toBe(1_234_567_890_000);
    expect(result!.reason).toBe('tf-up');
    expect(result!.executedBy).toBe('live');
    expect(result!.errorMessage).toBeNull();
    expect(result!.candleSnapshotTfs).toEqual([]);
    expect(result!.candleTimestampRange).toBeNull();
    expect(result!.tfSignalsJson).toBe(JSON.stringify(sig.tfSignals));
  });

  it('paperMode=false is hardcoded in the event-derived params', () => {
    const ev = consensusEvent({ action: 'enter_long' });
    const result = eventToParams(ev);
    expect(result!.decision).toBe('executed');
    expect(result!.executedBy).toBe('live');
  });
});

// ─── writeJournalEntry tests ─────────────────────────────────────────────────

describe('writeJournalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    q.mockResolvedValue({ id: 'row-1' } as any);
  });

  const input = {
    traceId: 'trace-abc',
    timestamp: 1_234_567_890_000,
    action: 'enter_long' as const,
    decision: 'executed' as const,
    confidence: 0.8,
    weightedBullScore: 0.9,
    weightedBearScore: 0.1,
    regime: 'trending_up' as const,
    tfSignalsJson: '[{"tf":"1d","action":"bull"}]',
    reason: 'consensus long',
    executedBy: 'live' as const,
    paperMode: false,
    errorMessage: null,
    candleSnapshotTfs: ['1d', '4h'] as any[],
    candleTimestampRange: { from: 1_000_000_000_000, to: 1_234_567_890_000 },
  };

  it('invokes query with INSERT_SQL and 16 ordered parameters', async () => {
    await writeJournalEntry(input);

    expect(q).toHaveBeenCalledTimes(1);
    const [sql, params] = q.mock.calls[0];
    expect(sql).toContain('INSERT INTO dna_journal');
    expect(sql).toContain('RETURNING id');
    expect(params).toHaveLength(16);
    expect(params[0]).toBe('trace-abc');
    expect(params[1]).toBe(new Date(input.timestamp).toISOString());
    expect(params[2]).toBe('enter_long');
    expect(params[3]).toBe('executed');
    expect(params[4]).toBe(0.8);
    expect(params[5]).toBe(0.9);
    expect(params[6]).toBe(0.1);
    expect(params[7]).toBe('trending_up');
    expect(params[8]).toBe(input.tfSignalsJson);
    expect(params[9]).toBe('consensus long');
    expect(params[10]).toBe('live');
    expect(params[11]).toBe(false);
    expect(params[12]).toBeNull();
    expect(params[13]).toEqual(['1d', '4h']);
    expect(params[14]).toBe(1_000_000_000_000);
    expect(params[15]).toBe(1_234_567_890_000);
  });

  it('resolves timestamp via new Date(ms).toISOString()', async () => {
    await writeJournalEntry(input);
    const iso = q.mock.calls[0][1][1];
    expect(iso).toBe(new Date(input.timestamp).toISOString());
  });

  it('nulls candleTimestampRange when omitted', async () => {
    await writeJournalEntry({
      ...input,
      candleTimestampRange: null,
    });
    expect(q.mock.calls[0][1][14]).toBeNull();
    expect(q.mock.calls[0][1][15]).toBeNull();
  });

  it('passes paperMode as the 12th parameter', async () => {
    await writeJournalEntry({ ...input, paperMode: true });
    expect(q.mock.calls[0][1][11]).toBe(true);
  });

  it('passes errorMessage as 13th parameter', async () => {
    await writeJournalEntry({ ...input, errorMessage: 'db unavailable' });
    expect(q.mock.calls[0][1][12]).toBe('db unavailable');
  });

  it('swallows errors and logs them — does not throw', async () => {
    q.mockRejectedValueOnce(new Error('db down'));
    await expect(writeJournalEntry(input)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
    expect((logError.mock.calls[0][0] as string)).toBe('[DNA-Journal] write failed');
    expect((logError.mock.calls[0][1] as any).traceId).toBe('trace-abc');
  });

  it('logs only the error once on failure', async () => {
  q.mockRejectedValueOnce(new Error('network'));
  await writeJournalEntry(input);
  expect(logError).toHaveBeenCalledTimes(1);
  expect(incCounter).toHaveBeenCalledTimes(1);
});

it('classifies timeout errors correctly', async () => {
  q.mockRejectedValueOnce(new Error('query timeout exceeded'));
  await writeJournalEntry(input);
  expect(incCounter).toHaveBeenCalledWith({ error_type: 'timeout' });
});

it('classifies unknown errors as unknown', async () => {
  q.mockRejectedValueOnce(new Error('something weird'));
  await writeJournalEntry(input);
  expect(incCounter).toHaveBeenCalledWith({ error_type: 'unknown' });
});
});
