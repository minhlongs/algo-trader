/**
 * Tests for dna-state-store.ts.
 *
 * Verifies:
 *  - InMemoryStateStore: default null, save/load round-trip, overwrite semantics
 *  - PostgresStateStore: delegates to injected queryFn; JSON round-trip; parse failure
 */

import { describe, it, expect, vi } from 'vitest';
import {
  InMemoryStateStore,
  PostgresStateStore,
  type DnaEngineState,
} from '../dna-state-store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DnaEngineState> = {}): DnaEngineState {
  return {
    schemaVersion: '1.0.0',
    savedAt: Date.now(),
    traceCounter: 5,
    lastTfSignals: [
      ['1d', { tf: '1d', action: 'bull', confidence: 0.9, entryHint: null, slHint: null, tpHint: null }],
    ],
    lastRegime: { regime: 'trending_up', regimeConfidence: 0.85, dominantTf: '1d', reason: 'up' },
    lastConsensus: {
      action: 'enter_long',
      direction: 'long',
      confidence: 0.8,
      reason: 'consensus=long agreement=3/3',
      emittedAt: Date.now(),
      tfSignals: [],
      weightedBullScore: 0.9,
      weightedBearScore: 0.1,
      regime: 'trending_up',
      traceId: 't1',
    },
    ...overrides,
  };
}

// ─── InMemoryStateStore tests ────────────────────────────────────────────────

describe('InMemoryStateStore', () => {
  it('starts with null state', async () => {
    const store = new InMemoryStateStore();
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it('round-trips state through save then load', async () => {
    const store = new InMemoryStateStore();
    const state = makeState();
    await store.save(state);
    const loaded = await store.load();
    expect(loaded).toEqual(state);
  });

  it('overwrites previous state on subsequent save', async () => {
    const store = new InMemoryStateStore();
    await store.save(makeState({ traceCounter: 1 }));
    await store.save(makeState({ traceCounter: 2 }));
    const loaded = await store.load();
    expect(loaded?.traceCounter).toBe(2);
  });

  it('saving null makes load return null', async () => {
    const store = new InMemoryStateStore();
    await store.save(makeState());
    await store.save(null as unknown as DnaEngineState);
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it('is async — save/load return promises', async () => {
    const store = new InMemoryStateStore();
    const p1 = store.save(makeState());
    const p2 = store.load();
    expect(p1).toBeInstanceOf(Promise);
    expect(p2).toBeInstanceOf(Promise);
    await Promise.all([p1, p2]);
  });
});

// ─── PostgresStateStore tests ────────────────────────────────────────────────

describe('PostgresStateStore', () => {
  it('save calls queryFn with INSERT … ON CONFLICT SQL and JSON state', async () => {
    const queryFn = vi.fn().mockResolvedValue({});
    const store = new PostgresStateStore(queryFn);
    const state = makeState();
    await store.save(state);

    expect(queryFn).toHaveBeenCalledTimes(1);
    const [sql, params] = queryFn.mock.calls[0];
    expect(sql).toContain("INSERT INTO dna_engine_state");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(params).toHaveLength(1);
    expect(JSON.parse(params[0])).toEqual(state);
  });

  it('load returns parsed state when a row exists', async () => {
    const state = makeState({ traceCounter: 99 });
    const queryFn = vi.fn().mockResolvedValue({ rows: [{ state: JSON.stringify(state) }] });
    const store = new PostgresStateStore(queryFn);
    const loaded = await store.load();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryFn.mock.calls[0][0]).toContain("SELECT state FROM dna_engine_state");
    expect(loaded).toEqual(state);
  });

  it('load returns null when no row', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [] });
    const store = new PostgresStateStore(queryFn);
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it('load returns null when row has no state field', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [{}] });
    const store = new PostgresStateStore(queryFn);
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });

  it('load returns null on JSON parse failure', async () => {
    const queryFn = vi.fn().mockResolvedValue({ rows: [{ state: 'not-json' }] });
    const store = new PostgresStateStore(queryFn);
    const loaded = await store.load();
    expect(loaded).toBeNull();
  });
});
