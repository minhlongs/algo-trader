/**
 * P6 Dry-Run Smoke Verification — in-memory stack only.
 * Verifies: start → tick → stop → state persisted → restart (hydrated).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use fake timers globally — needed by all engine intervals.
vi.useFakeTimers();

import { startDnaEngine, stopDnaEngine, getDnaEngine, onDnaEvent } from '../orchestrator';
import type { Candle } from '../multi-tf-types';
import { InMemoryStateStore } from '../dna-state-store';

/** Deterministic candle generator for paper-only smoke tests. */
function makeCandles(): Candle[] {
  return Array.from({ length: 200 }, (_, i) => ({
    ts: Date.now() - (199 - i) * 60_000,
    open: 100 + i * 0.01,
    high: 100.5 + i * 0.01,
    low: 99.5 + i * 0.01,
    close: 100 + i * 0.01,
    volume: 10 + i,
  }));
}

/** Returns a provider with candles for all configured TFs (required for minTfAgreement). */
function makeProvider() {
  const data: Record<string, Candle[]> = {};
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d']) {
    data[tf] = makeCandles();
  }
  return {
    getCandles: async (_tf: string, _to: number, _count: number) => makeCandles(),
    getOrderBookSnapshot: async () => ({ bidVol: 1, askVol: 1 }),
  };
}

describe('P6 Dry-Run Smoke — DNA engine end-to-end (paper-only, in-memory)', () => {
  beforeEach(() => stopDnaEngine());

  it('A. starts in paper mode and emits tick events', async () => {
    vi.setSystemTime(new Date());
    const eng = startDnaEngine(makeProvider(), undefined, new InMemoryStateStore());
    expect(eng.paperMode).toBe(true);

    const ticks: any[] = [];
    const unsub = onDnaEvent((e) => { if (e.type === 'tick') ticks.push(e); });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(20_000);
    unsub();
    stopDnaEngine();

    expect(ticks.length).toBeGreaterThanOrEqual(1);
  });

  it('B. state persisted to store after ticks', async () => {
    vi.setSystemTime(new Date());
    const store = new InMemoryStateStore();
    startDnaEngine(makeProvider(), { minTfAgreement: 1 }, store);
    await vi.advanceTimersByTimeAsync(10_000); // clear 1m initial delay
    await vi.advanceTimersByTimeAsync(20_000);
    stopDnaEngine();
    const saved = await store.load();
    expect(saved).not.toBeNull();
    expect(saved!.lastConsensus).not.toBeNull();
  });

  it('C. restart hydrates state from store', async () => {
    vi.setSystemTime(new Date());
    const store = new InMemoryStateStore();
    startDnaEngine(makeProvider(), { minTfAgreement: 1 }, store);
    await vi.advanceTimersByTimeAsync(20_000);
    stopDnaEngine();

    startDnaEngine(makeProvider(), { minTfAgreement: 1 }, store);
    await vi.advanceTimersByTimeAsync(500); // let hydrate run
    const after = getDnaEngine()!.getLastConsensus();
    expect(after).not.toBeNull();
    stopDnaEngine();
  });

  it('D. full lifecycle (start → tick → stop) completes in paper mode', async () => {
    vi.setSystemTime(new Date());
    const events: any[] = [];
    const unsub = onDnaEvent((e) => events.push(e));
    startDnaEngine(makeProvider(), { minTfAgreement: 1 }, new InMemoryStateStore());
    await vi.advanceTimersByTimeAsync(10_000); // clear 1m initial delay
    await vi.advanceTimersByTimeAsync(20_000);
    stopDnaEngine();
    unsub();
    const types = events.map((e) => e.type);
    expect(types.some((t: string) => t === 'tick')).toBe(true);
    const consensusEvents = events.filter((e) => e.type === 'consensus_computed');
    expect(consensusEvents.length).toBeGreaterThanOrEqual(1);
  });
});
