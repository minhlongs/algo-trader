/**
 * Signal TTL Enforcer Tests
 * Covers register (incl. timer cancellation + zero-delay expiry), evict,
 * getLive filtering, sweepExpired, size, and clear
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Signal } from '../signal-types';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({ logger: mockLogger }));

import { SignalTtlEnforcer } from '../signal-ttl-enforcer';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const now = Date.now();
  return {
    id: overrides.id ?? 'sig-1',
    ts: now,
    market: overrides.market ?? 'BTC-USD',
    side: 'BUY',
    size: 0.5,
    confidence: 0.8,
    strategy: 'momentum',
    ttl: 300,
    expiresAt: overrides.expiresAt ?? now + 300_000,
  };
}

describe('SignalTtlEnforcer', () => {
  let enforcer: SignalTtlEnforcer;

  beforeEach(() => {
    vi.clearAllMocks();
    enforcer = new SignalTtlEnforcer();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('writes the signal to the map immediately (visible to getLive same tick)', () => {
      enforcer.register(makeSignal({ id: 'a', expiresAt: Date.now() + 1000 }));
      expect(enforcer.size).toBe(1);
      expect(enforcer.getLive()).toHaveLength(1);
    });

    it('cancels a stale timer before re-registering the same ID', () => {
      vi.useFakeTimers();
      const first = makeSignal({ id: 'dup', expiresAt: Date.now() + 1000 });
      enforcer.register(first);
      const firstTimer = (enforcer as any).timers.get('dup');
      expect(firstTimer).toBeTruthy();

      // Re-register with a different expiry — old timer must be cleared
      const second = makeSignal({ id: 'dup', expiresAt: Date.now() + 5000 });
      enforcer.register(second);
      const secondTimer = (enforcer as any).timers.get('dup');
      expect(secondTimer).not.toBe(firstTimer);
      expect(enforcer.size).toBe(1);
    });

    it('evicts the signal after the TTL expires (fake timers)', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      enforcer.register(makeSignal({ id: 'exp', expiresAt: now + 1000 }));
      expect(enforcer.size).toBe(1);

      await vi.advanceTimersByTimeAsync(1001);
      expect(enforcer.size).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Evicted signal exp'),
      );
    });

    it('uses zero delay when the signal is already expired (delay <= 0)', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      // Already expired — written to map this tick, then evicted on the next timer tick
      enforcer.register(makeSignal({ id: 'stale', expiresAt: now - 100 }));
      expect(enforcer.size).toBe(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(enforcer.size).toBe(0);
    });
  });

  // ── evict ─────────────────────────────────────────────────────────────────

  describe('evict', () => {
    it('removes the signal and cancels its timer', () => {
      const sig = makeSignal({ id: 'ev', expiresAt: Date.now() + 1000 });
      enforcer.register(sig);
      expect(enforcer.size).toBe(1);

      enforcer.evict('ev');
      expect(enforcer.size).toBe(0);
      expect((enforcer as any).timers.has('ev')).toBe(false);
    });

    it('is a no-op when the signal does not exist', () => {
      enforcer.evict('missing');
      expect(enforcer.size).toBe(0);
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('cancels the timer even when the signal is absent', () => {
      enforcer.register(makeSignal({ id: 'x', expiresAt: Date.now() + 1000 }));
      enforcer.evict('x');
      expect((enforcer as any).timers.has('x')).toBe(false);
    });
  });

  // ── getLive ───────────────────────────────────────────────────────────────

  describe('getLive', () => {
    it('returns only signals whose expiresAt is in the future', () => {
      const now = Date.now();
      enforcer.register(makeSignal({ id: 'live', expiresAt: now + 1000 }));
      enforcer.register(makeSignal({ id: 'dead', expiresAt: now - 100 }));
      const live = enforcer.getLive();
      expect(live).toHaveLength(1);
      expect(live[0]!.id).toBe('live');
    });

    it('returns empty array when no signals are live', () => {
      expect(enforcer.getLive()).toEqual([]);
    });
  });

  // ── sweepExpired ──────────────────────────────────────────────────────────

  describe('sweepExpired', () => {
    it('evicts all expired signals and returns the count', () => {
      const now = Date.now();
      enforcer.register(makeSignal({ id: 'a', expiresAt: now - 100 }));
      enforcer.register(makeSignal({ id: 'b', expiresAt: now - 200 }));
      enforcer.register(makeSignal({ id: 'c', expiresAt: now + 1000 }));

      const count = enforcer.sweepExpired();
      expect(count).toBe(2);
      expect(enforcer.size).toBe(1);
      expect(enforcer.getLive().map((s) => s.id)).toEqual(['c']);
    });

    it('returns 0 when nothing is expired', () => {
      enforcer.register(makeSignal({ id: 'fresh', expiresAt: Date.now() + 1000 }));
      expect(enforcer.sweepExpired()).toBe(0);
      expect(enforcer.size).toBe(1);
    });

    it('returns 0 on an empty store', () => {
      expect(enforcer.sweepExpired()).toBe(0);
    });
  });

  // ── size ──────────────────────────────────────────────────────────────────

  describe('size', () => {
    it('reflects the number of registered signals', () => {
      expect(enforcer.size).toBe(0);
      enforcer.register(makeSignal({ id: '1' }));
      enforcer.register(makeSignal({ id: '2' }));
      expect(enforcer.size).toBe(2);
    });
  });

  // ── clear ─────────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('clears all signals and cancels all timers', () => {
      enforcer.register(makeSignal({ id: 'a', expiresAt: Date.now() + 1000 }));
      enforcer.register(makeSignal({ id: 'b', expiresAt: Date.now() + 1000 }));
      enforcer.clear();
      expect(enforcer.size).toBe(0);
      expect((enforcer as any).timers.size).toBe(0);
    });

    it('is safe to call on an empty store', () => {
      expect(() => enforcer.clear()).not.toThrow();
    });
  });
});