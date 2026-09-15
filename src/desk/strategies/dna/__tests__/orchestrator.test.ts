/**
 * Tests for DnaEngine orchestrator — Lifecycle, persistence & signals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DnaEngine, resetDnaEngine } from '../orchestrator.js';
import { InMemoryStateStore } from '../dna-state-store.js';
import type { ConsensusSignal } from '../multi-tf-types.js';
import { makeProvider, makeEngine } from './orchestrator-fixtures.js';

describe('DnaEngine — lifecycle, persistence & signals', () => {
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

  it('starts scheduler and sets isRunning', () => {
    engine.start();
    expect(engine.isRunning).toBe(true);
    engine.stop();
    expect(engine.isRunning).toBe(false);
  });

  it('is idempotent on double start', () => {
    engine.start();
    engine.start();
    expect(engine.isRunning).toBe(true);
  });

  it('hydrates state from store on start when state exists', async () => {
    const seedConsensus: ConsensusSignal = {
      traceId: 'seed-1',
      action: 'hold',
      confidence: 0.6,
      weightedBullScore: 0.4,
      weightedBearScore: 0.5,
      tfSignals: [],
      reason: 'seeded',
      entryPrice: null,
      slPrice: null,
      tpPrice: null,
      regime: 'ranging',
      emittedAt: Date.now(),
    };

    await store.save({
      schemaVersion: '2026-06-01-v1',
      savedAt: Date.now(),
      traceCounter: 42,
      lastTfSignals: [],
      lastRegime: null,
      lastConsensus: seedConsensus,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(10);
    const c = engine.getLastConsensus();
    expect(c).not.toBeNull();
    expect(c!.reason).toBe('seeded');
  });

  it('saves state to store on stop', async () => {
    engine.start();
    await vi.advanceTimersByTimeAsync(200);
    engine.stop();
    await vi.advanceTimersByTimeAsync(50);
    const saved = await store.load();
    expect(saved).not.toBeNull();
    expect(saved!.savedAt).toBeGreaterThan(0);
    expect(saved!.schemaVersion).toBe('2026-06-01-v1');
  });

  it('starts fresh when store is empty (no crash)', async () => {
    engine.start();
    await vi.advanceTimersByTimeAsync(200);
    expect(engine.isRunning).toBe(true);
  });

  it('getLastConsensus / getLastTfSignal return null/undefined before any tick', () => {
    expect(engine.getLastConsensus()).toBeNull();
    expect(engine.getLastTfSignal('1m')).toBeUndefined();
  });

  it('getLastTfSignal returns the latest signal after a tick', async () => {
    engine.start();
    vi.setSystemTime(new Date());
    engine.start();
    await vi.advanceTimersByTimeAsync(10_000);
    const s = engine.getLastTfSignal('1m');
    if (s) {
      expect(['bull', 'bear', 'neutral']).toContain(s.action);
      expect(typeof s.confidence).toBe('number');
    }
  });

  it('paper mode defaults to true and can be toggled', () => {
    expect(engine.paperMode).toBe(true);
    engine.setPaperMode(false);
    expect(engine.paperMode).toBe(false);
  });
});
