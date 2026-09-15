import { describe, it, expect, vi, beforeEach } from 'vitest';
import { q, logError, consensus, consensusEvent } from './journal-writer-fixtures.js';
import { eventToParams, writeJournalEntry } from '../journal-writer.js';

describe('eventToParams', () => {
  beforeEach(() => { vi.clearAllMocks(); });

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
      action: 'enter_long', confidence: 0.77, weightedBullScore: 0.85, weightedBearScore: 0.15,
      regime: 'trending_up', emittedAt: 1_234_567_890_000, reason: 'tf-up',
      tfSignals: [{ tf: '1d', action: 'bull', confidence: 0.9 }],
    });
    const result = eventToParams({ type: 'consensus_computed' as const, signal: sig });
    expect(result).toEqual({
      timestamp: 1_234_567_890_000, action: 'enter_long', decision: 'executed',
      confidence: 0.77, weightedBullScore: 0.85, weightedBearScore: 0.15,
      regime: 'trending_up', tfSignalsJson: JSON.stringify(sig.tfSignals), reason: 'tf-up',
      executedBy: 'live', errorMessage: null, candleSnapshotTfs: [], candleTimestampRange: null,
    });
  });
  it('paperMode=false is hardcoded in the event-derived params', () => {
    const result = eventToParams(consensusEvent({ action: 'enter_long' }));
    expect(result!.decision).toBe('executed');
    expect(result!.executedBy).toBe('live');
  });
});

describe('writeJournalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    q.mockResolvedValue({ id: 'row-1' } as any);
  });

  const input = {
    traceId: 'trace-abc', timestamp: 1_234_567_890_000, action: 'enter_long' as const,
    decision: 'executed' as const, confidence: 0.8, weightedBullScore: 0.9, weightedBearScore: 0.1,
    regime: 'trending_up' as const, tfSignalsJson: '[{"tf":"1d","action":"bull"}]',
    reason: 'consensus long', executedBy: 'live' as const, paperMode: false, errorMessage: null,
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
    expect(params).toEqual([
      'trace-abc', new Date(input.timestamp).toISOString(), 'enter_long', 'executed',
      0.8, 0.9, 0.1, 'trending_up', input.tfSignalsJson, 'consensus long',
      'live', false, null, ['1d', '4h'], 1_000_000_000_000, 1_234_567_890_000,
    ]);
  });
  it('resolves timestamp via new Date(ms).toISOString()', async () => {
    await writeJournalEntry(input);
    expect(q.mock.calls[0][1][1]).toBe(new Date(input.timestamp).toISOString());
  });
  it('nulls candleTimestampRange when omitted', async () => {
    await writeJournalEntry({ ...input, candleTimestampRange: null });
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
  it('swallows errors and logs them -- does not throw', async () => {
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
  });
});
