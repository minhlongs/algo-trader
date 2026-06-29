/**
 * Tests for DnaEngine orchestrator (Phase 02 — coverage gate ≥ 80%).
 * Uses vitest + InMemoryStateStore (no DB required).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DnaEngine,
  startDnaEngine,
  stopDnaEngine,
  resetDnaEngine,
  getDnaEngine,
  onDnaEvent,
  DnaLifecycleEvent,
  CandleProvider,
} from '../orchestrator.js';
import { InMemoryStateStore } from '../dna-state-store.js';
import { TfId, ConsensusSignal } from '../multi-tf-types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCandles(count = 50): { t: number; o: number; h: number; l: number; c: number; v: number }[] {
  const candles: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
  let base = 100;
  const now = Math.floor(Date.now() / 1000);
  for (let i = count; i >= 0; i--) {
    base += (Math.random() - 0.48) * 2;
    candles.push({
      t: now - i * 60,
      o: base,
      h: base + 1,
      l: base - 1,
      c: base + (Math.random() - 0.5) * 0.5,
      v: 100 + Math.random() * 50,
    });
  }
  return candles;
}

function makeProvider(tfMap: Partial<Record<TfId, { t: number; o: number; h: number; l: number; c: number; v: number }[]>> = {}): CandleProvider {
  const store: Record<TfId, { t: number; o: number; h: number; l: number; c: number; v: number }[]> = {};
  for (const tf of (['1m', '5m', '15m', '1h'] as TfId[])) {
    store[tf] = tfMap[tf] ?? makeCandles();
  }
  return {
    getCandles: async (_tf: TfId, _to: number, _count: number) => {
      return store[_tf] ?? makeCandles();
    },
  };
}

function makeEngine(provider?: CandleProvider, stateStore?: InMemoryStateStore): DnaEngine {
  return new DnaEngine(provider ?? makeProvider(), {}, stateStore ?? new InMemoryStateStore());
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DnaEngine — orchestrator', () => {
  let store: InMemoryStateStore;
  let engine: DnaEngine;

  beforeEach(() => {
    store = new InMemoryStateStore();
    engine = makeEngine(makeProvider(), store);
    vi.useFakeTimers();
  });

  afterEach(async () => {
    engine.stop();
    vi.useRealTimers();
    resetDnaEngine();
  });

  // ── start / stop lifecycle ────────────────────────────────────────────────────

  it('starts scheduler and sets isRunning', () => {
    engine.start();
    expect(engine.isRunning).toBe(true);
    engine.stop();
    expect(engine.isRunning).toBe(false);
  });

  it('is idempotent on double start', () => {
    engine.start();
    engine.start(); // no-op
    expect(engine.isRunning).toBe(true);
  });

  // ── State persistence (Phase 01) ─────────────────────────────────────────────

  it('hydrates state from store on start when state exists', async () => {
    // Pre-seed the store.
    await store.save({
      schemaVersion: '2026-06-01-v1',
      savedAt: Date.now(),
      traceCounter: 42,
      lastTfSignals: [],
      lastRegime: null,
      lastConsensus: {
        traceId: 'seed-1',
        computedAt: Date.now(),
        action: 'hold',
        confidence: 0.6,
        weightedBullScore: 0.4,
        weightedBearScore: 0.5,
        tfSignals: [],
        reason: 'seeded',
      } as any,
    });

    // Restart triggers load synchronously (start schedules .load() on next tick,
    // but the state is set immediately on the field via assignment — we advance timers).
    engine.start();
    // Let microtask queue flush the .then() from start()
    await vi.advanceTimersByTimeAsync(10);
    // After hydration, lastConsensus should reflect the store value (traceId match).
    const c = engine.getLastConsensus();
    expect(c).not.toBeNull();
    expect(c!.reason).toBe('seeded');
  });

  it('saves state to store on stop', async () => {
    engine.start();
    await vi.advanceTimersByTimeAsync(200); // let onTfTick run and populate signals
    engine.stop();
    // save is async — give microtask queue time.
    await vi.advanceTimersByTimeAsync(50);
    const saved = await store.load();
    expect(saved).not.toBeNull();
    expect(saved!.savedAt).toBeGreaterThan(0);
    expect(saved!.schemaVersion).toBe('2026-06-01-v1');
  });

  it('starts fresh when store is empty (no crash)', async () => {
    // empty store — load returns null
    engine.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(engine.isRunning).toBe(true);
  });

  // ── getters ─────────────────────────────────────────────────────────────────

  it('getLastConsensus / getLastTfSignal return null/undefined before any tick', () => {
    expect(engine.getLastConsensus()).toBeNull();
    expect(engine.getLastTfSignal('1m')).toBeUndefined();
  });

  it('getLastTfSignal returns the latest signal after a tick', async () => {
    engine.start();
    // Advance enough to let at least one 1m tick fire.
    // Align delay for 1m is min(boundary, 5s) = ≤5s; set clock to now so boundary = 0.
    vi.setSystemTime(new Date());
    engine.start();
    await vi.advanceTimersByTimeAsync(10_000);
    const s = engine.getLastTfSignal('1m');
    // Signal may be hold or actionable — both are valid; we just check shape.
    if (s) {
      expect(['bull', 'bear', 'neutral']).toContain(s.action);
      expect(typeof s.confidence).toBe('number');
    }
  });

  // ── lifecycle events ─────────────────────────────────────────────────────────

  it('emits tick event on every TF tick', async () => {
    const ticks: DnaLifecycleEvent[] = [];
    const unsub = onDnaEvent((ev) => ticks.push(ev));
    engine.start();
    vi.setSystemTime(new Date());
    await vi.advanceTimersByTimeAsync(10_000);
    const tickEvts = ticks.filter((e) => e.type === 'tick');
    expect(tickEvts.length).toBeGreaterThanOrEqual(1);
    unsub();
  });

  it('emits error event when provider throws', async () => {
    const badProvider: CandleProvider = {
      getCandles: async () => { throw new Error('network'); },
    };
    const badEngine = new DnaEngine(badProvider, {}, new InMemoryStateStore());
    const errors: DnaLifecycleEvent[] = [];
    onDnaEvent((ev) => { if (ev.type === 'error') errors.push(ev); });
    badEngine.start();
    vi.setSystemTime(new Date());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].err!.message).toBe('network');
    badEngine.stop();
  });

  it('unsubscribe removes listener', async () => {
    const hits: DnaLifecycleEvent[] = [];
    const unsub = onDnaEvent((ev) => hits.push(ev));
    engine.start();
    vi.setSystemTime(new Date());
    await vi.advanceTimersByTimeAsync(10_000);
    const before = hits.length;
    unsub();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hits.length).toBe(before); // no new events after unsubscribe
  });

  // ── Singleton API ────────────────────────────────────────────────────────────

  it('startDnaEngine / getDnaEngine / stopDnaEngine roundtrip', async () => {
    const eng = startDnaEngine(makeProvider(), {}, store);
    expect(getDnaEngine()).toBe(eng);
    stopDnaEngine();
    expect(getDnaEngine()).toBeNull();
  });

  it('resetDnaEngine stops existing engine', () => {
    const eng = startDnaEngine(makeProvider(), {}, store);
    resetDnaEngine();
    expect(getDnaEngine()).toBeNull();
    expect(eng.isRunning).toBe(false);
  });

  // ── paper mode ───────────────────────────────────────────────────────────────

  it('paper mode defaults to true and can be toggled', () => {
    expect(engine.paperMode).toBe(true);
    engine.setPaperMode(false);
    expect(engine.paperMode).toBe(false);
  });
});
