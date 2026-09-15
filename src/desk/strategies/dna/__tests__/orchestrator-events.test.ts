/**
 * Tests for DnaEngine orchestrator — Lifecycle events & Singleton API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DnaEngine,
  startDnaEngine,
  stopDnaEngine,
  resetDnaEngine,
  getDnaEngine,
  onDnaEvent,
  type DnaLifecycleEvent,
  type CandleProvider,
} from '../orchestrator.js';
import { InMemoryStateStore } from '../dna-state-store.js';
import { makeProvider, makeEngine } from './orchestrator-fixtures.js';

describe('DnaEngine — lifecycle events & singleton API', () => {
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
      getCandles: async () => {
        throw new Error('network');
      },
    };
    const badEngine = new DnaEngine(badProvider, {}, new InMemoryStateStore());
    const errors: DnaLifecycleEvent[] = [];
    onDnaEvent((ev) => {
      if (ev.type === 'error') errors.push(ev);
    });
    badEngine.start();
    vi.setSystemTime(new Date());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0].err?.message).toBe('network');
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
    expect(hits.length).toBe(before);
  });

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
});
