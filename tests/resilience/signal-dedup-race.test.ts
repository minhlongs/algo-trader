/**
 * Signal Dedup Race Condition Tests
 * Verifies that expired-entry eviction and signal registration are atomic
 * within a single event-loop tick (no TTL-reset ambiguity or phantom gaps).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalDedupGuard } from '../../src/signal/signal-dedup-guard';
import { SignalTtlEnforcer } from '../../src/signal/signal-ttl-enforcer';
import type { Signal } from '../../src/signal/signal-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const now = Date.now();
  return {
    id: 'test-signal-id',
    ts: now,
    market: 'BTC-USD',
    side: 'BUY',
    size: 0.5,
    confidence: 0.8,
    strategy: 'test-strategy',
    ttl: 60,
    expiresAt: now + 60_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SignalDedupGuard — race condition tests
// ---------------------------------------------------------------------------

describe('SignalDedupGuard — expired-entry race', () => {
  let guard: SignalDedupGuard;

  beforeEach(() => {
    // Long cleanup interval so periodic eviction never runs during tests
    guard = new SignalDedupGuard(999_999);
  });

  afterEach(() => {
    guard.destroy();
  });

  it('accepts a new signal when no prior entry exists', () => {
    const signal = makeSignal();
    expect(guard.isDuplicate(signal)).toBe(false);
  });

  it('rejects a duplicate signal within its TTL', () => {
    const signal = makeSignal();
    guard.isDuplicate(signal); // register
    expect(guard.isDuplicate(signal)).toBe(true);
  });

  it('accepts a signal after its TTL has elapsed (expired entry cleaned up)', () => {
    const past = Date.now() - 1; // already expired
    const expiredSignal = makeSignal({ expiresAt: past });

    // Manually insert an expired entry as if it was registered earlier
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (guard as any).seen.set('test-signal-id', { expiresAt: past });

    expect(guard.size).toBe(1); // expired entry still in map

    // Calling isDuplicate should clean up the expired entry and register new one
    const freshSignal = makeSignal(); // expiresAt = future
    const result = guard.isDuplicate(freshSignal);

    expect(result).toBe(false); // not a duplicate — expired entry was evicted
    expect(guard.size).toBe(1); // map still has exactly 1 entry (the fresh one)

    // The fresh entry must have the NEW expiresAt, not the expired one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (guard as any).seen.get('test-signal-id');
    expect(entry.expiresAt).toBe(freshSignal.expiresAt);
    expect(entry.expiresAt).toBeGreaterThan(Date.now());
  });

  it('does not reset TTL bucket when periodic eviction races with isDuplicate', () => {
    // Simulate scenario: entry is expired, evictExpired() runs, then isDuplicate()
    const past = Date.now() - 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (guard as any).seen.set('test-signal-id', { expiresAt: past });

    // Periodic eviction fires — removes the expired entry
    guard.evictExpired();
    expect(guard.size).toBe(0);

    // Now isDuplicate() for a fresh signal: should register, not find stale state
    const freshSignal = makeSignal();
    expect(guard.isDuplicate(freshSignal)).toBe(false);
    expect(guard.size).toBe(1);
  });

  it('back-to-back isDuplicate calls on same ID in same tick: second is a dup', () => {
    const signal = makeSignal();
    expect(guard.isDuplicate(signal)).toBe(false); // registers
    expect(guard.isDuplicate(signal)).toBe(true);  // duplicate
  });

  it('different IDs are never duplicates of each other', () => {
    const a = makeSignal({ id: 'aaa' });
    const b = makeSignal({ id: 'bbb' });
    expect(guard.isDuplicate(a)).toBe(false);
    expect(guard.isDuplicate(b)).toBe(false);
    // Both registered
    expect(guard.isDuplicate(a)).toBe(true);
    expect(guard.isDuplicate(b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SignalTtlEnforcer — registration race condition tests
// ---------------------------------------------------------------------------

describe('SignalTtlEnforcer — register-before-timer race', () => {
  let enforcer: SignalTtlEnforcer;

  beforeEach(() => {
    vi.useFakeTimers();
    enforcer = new SignalTtlEnforcer();
  });

  afterEach(() => {
    enforcer.clear();
    vi.useRealTimers();
  });

  it('signal is immediately visible in getLive() after register()', () => {
    const signal = makeSignal({ expiresAt: Date.now() + 60_000 });
    enforcer.register(signal);
    const live = enforcer.getLive();
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(signal.id);
  });

  it('signal is evicted after its TTL elapses', () => {
    const ttlMs = 1_000;
    const signal = makeSignal({ expiresAt: Date.now() + ttlMs });
    enforcer.register(signal);
    expect(enforcer.size).toBe(1);

    vi.advanceTimersByTime(ttlMs + 1);
    expect(enforcer.size).toBe(0);
  });

it('already-expired signal is evicted immediately', () => {
  // Signal expired 1ms ago
  const signal = makeSignal({ expiresAt: Date.now() - 1 });
  enforcer.register(signal);

  // Already-expired signals are evicted immediately (no setTimeout)
  expect(enforcer.size).toBe(0);
});

  it('re-registering same ID cancels old timer and extends TTL', () => {
    const now = Date.now();
    const signal1 = makeSignal({ expiresAt: now + 500 });
    const signal2 = makeSignal({ expiresAt: now + 5_000 });

    enforcer.register(signal1);
    expect(enforcer.size).toBe(1);

    // Advance past signal1's TTL but before signal2's TTL
    vi.advanceTimersByTime(600);
    // signal1 timer would have fired — but we re-registered with longer TTL
    enforcer.register(signal2); // cancels old timer, sets new one
    // signal2 should still be live after signal1's original TTL
    vi.advanceTimersByTime(100);
    expect(enforcer.size).toBe(1);

    // Now advance past signal2's TTL
    vi.advanceTimersByTime(5_000);
    expect(enforcer.size).toBe(0);
  });

  it('signal is in map before delay is computed (same-tick getLive sees it)', () => {
    // This test verifies the ordering invariant: set THEN setTimeout
    // We spy on signals.set to confirm it's called before setTimeout
    const setOrder: string[] = [];

    const origSet = enforcer['signals'].set.bind(enforcer['signals']);
    vi.spyOn(enforcer['signals'], 'set').mockImplementation((k, v) => {
      setOrder.push('set');
      return origSet(k, v);
    });

    const origSetTimeout = globalThis.setTimeout;
    // We can't spy on setTimeout directly with fake timers easily, so
    // instead verify the functional guarantee: getLive() returns signal
    const signal = makeSignal({ expiresAt: Date.now() + 10_000 });
    enforcer.register(signal);

    expect(setOrder[0]).toBe('set'); // set was called
    expect(enforcer.getLive()).toHaveLength(1);

    globalThis.setTimeout; // reference to avoid unused warning
    void origSetTimeout;
  });

  it('evict() removes signal and cancels timer without error', () => {
    const signal = makeSignal({ expiresAt: Date.now() + 60_000 });
    enforcer.register(signal);
    enforcer.evict(signal.id);
    expect(enforcer.size).toBe(0);

    // Advance timers — stale timer should not throw
    vi.advanceTimersByTime(60_001);
    expect(enforcer.size).toBe(0);
  });

  it('sweepExpired() removes all past-TTL signals', () => {
    const now = Date.now();
    const expired = makeSignal({ id: 'exp', expiresAt: now - 1 });
    const live = makeSignal({ id: 'live', expiresAt: now + 60_000 });

    // Inject expired directly so timer doesn't remove it first
    enforcer['signals'].set(expired.id, expired);
    enforcer.register(live);

    const count = enforcer.sweepExpired();
    expect(count).toBe(1);
    expect(enforcer.size).toBe(1);
    expect(enforcer.getLive()[0].id).toBe('live');
  });
});
