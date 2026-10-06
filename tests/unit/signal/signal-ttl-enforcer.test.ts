/**
 * Signal TTL Enforcer Unit Tests
 * Verifies periodic sweep interval (1000ms), FIFO bounding (MAX_SIGNALS = 10,000),
 * clean stop() method, and live signal filtering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalTtlEnforcer, MAX_SIGNALS } from '../../../src/signal/signal-ttl-enforcer';
import type { Signal } from '../../../src/signal/signal-types';

function makeSignal(id: string, expiresAt: number): Signal {
  return {
    id,
    ts: Date.now(),
    market: 'BTC-USD',
    side: 'BUY',
    size: 1.0,
    confidence: 0.85,
    strategy: 'momentum',
    ttl: 60,
    expiresAt,
  };
}

describe('SignalTtlEnforcer (Sweep-Based)', () => {
  let enforcer: SignalTtlEnforcer;

  beforeEach(() => {
    vi.useFakeTimers();
    enforcer = new SignalTtlEnforcer(1_000);
  });

  afterEach(() => {
    enforcer.stop();
    enforcer.clear();
    vi.useRealTimers();
  });

  it('registers signals and retrieves live signals', () => {
    const now = Date.now();
    const sig1 = makeSignal('sig-1', now + 5_000);
    const sig2 = makeSignal('sig-2', now - 1_000);

    enforcer.register(sig1);
    enforcer.register(sig2);

    expect(enforcer.size).toBe(2);
    const live = enforcer.getLive();
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe('sig-1');
  });

  it('sweeps expired signals automatically on 1000ms interval', () => {
    const now = Date.now();
    const sig1 = makeSignal('sig-1', now + 500);
    const sig2 = makeSignal('sig-2', now + 2_500);

    enforcer.register(sig1);
    enforcer.register(sig2);
    expect(enforcer.size).toBe(2);

    // Advance 1000ms -> interval fires and sweeps sig1
    vi.advanceTimersByTime(1_000);
    expect(enforcer.size).toBe(1);
    expect(enforcer.getLive()[0]!.id).toBe('sig-2');

    // Advance another 2000ms -> interval fires and sweeps sig2
    vi.advanceTimersByTime(2_000);
    expect(enforcer.size).toBe(0);
  });

  it('enforces FIFO bounded capacity of MAX_SIGNALS (10,000)', () => {
    const now = Date.now();
    for (let i = 0; i < MAX_SIGNALS; i++) {
      enforcer.register(makeSignal(`sig-${i}`, now + 100_000));
    }
    expect(enforcer.size).toBe(MAX_SIGNALS);

    // Register 1 more signal -> oldest (sig-0) should be dropped
    enforcer.register(makeSignal('sig-overflow', now + 100_000));
    expect(enforcer.size).toBe(MAX_SIGNALS);

    const live = enforcer.getLive();
    expect(live.some((s) => s.id === 'sig-0')).toBe(false);
    expect(live.some((s) => s.id === 'sig-1')).toBe(true);
    expect(live.some((s) => s.id === 'sig-overflow')).toBe(true);
  });

  it('updating an existing signal does not drop other signals', () => {
    const now = Date.now();
    enforcer.register(makeSignal('sig-1', now + 1_000));
    enforcer.register(makeSignal('sig-1', now + 2_000));
    expect(enforcer.size).toBe(1);
  });

  it('evicts a specific signal manually via evict()', () => {
    const now = Date.now();
    enforcer.register(makeSignal('sig-1', now + 5_000));
    expect(enforcer.size).toBe(1);

    enforcer.evict('sig-1');
    expect(enforcer.size).toBe(0);
  });

  it('stop() terminates the periodic sweep interval', () => {
    const now = Date.now();
    enforcer.register(makeSignal('sig-1', now + 500));
    enforcer.stop();

    vi.advanceTimersByTime(2_000);
    // Interval was stopped, so signal is still in map (though not live)
    expect(enforcer.size).toBe(1);
    expect(enforcer.getLive()).toHaveLength(0);
  });

  it('clear() empties all signals', () => {
    const now = Date.now();
    enforcer.register(makeSignal('sig-1', now + 5_000));
    enforcer.register(makeSignal('sig-2', now + 5_000));
    enforcer.clear();
    expect(enforcer.size).toBe(0);
  });
});
