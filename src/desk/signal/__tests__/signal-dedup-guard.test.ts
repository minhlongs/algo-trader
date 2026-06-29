/**
 * Signal Dedup Guard — unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignalDedupGuard } from '../signal-dedup-guard';
import type { Signal } from '../signal-types';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  const now = Date.now();
  return {
    id: 'abc123',
    ts: now,
    market: 'BTC-USD',
    side: 'BUY',
    size: 0.5,
    confidence: 0.8,
    strategy: 'momentum',
    ttl: 300,
    expiresAt: now + 300_000,
    ...overrides,
  };
}

describe('SignalDedupGuard', () => {
  let guard: SignalDedupGuard;

  beforeEach(() => {
    guard = new SignalDedupGuard(999_999); // disable auto-cleanup in tests
  });

  afterEach(() => {
    guard.destroy();
  });

  it('accepts a new signal', () => {
    const sig = makeSignal();
    expect(guard.isDuplicate(sig)).toBe(false);
  });

  it('rejects a duplicate signal within TTL', () => {
    const sig = makeSignal();
    guard.isDuplicate(sig); // register
    expect(guard.isDuplicate(sig)).toBe(true);
  });

  it('accepts signal after TTL expiry', () => {
    const past = Date.now() - 1000;
    const sig = makeSignal({ expiresAt: past });
    guard.isDuplicate(sig); // register as expired
    expect(guard.isDuplicate(sig)).toBe(false); // expired → re-register
  });

  it('buildId is deterministic for same bucket', () => {
    const ts = 1_700_000_000_000;
    const ttl = 300;
    const id1 = SignalDedupGuard.buildId('strat', 'BTC-USD', 'BUY', ts, ttl);
    const id2 = SignalDedupGuard.buildId('strat', 'BTC-USD', 'BUY', ts + 1000, ttl);
    expect(id1).toBe(id2); // same bucket
  });

  it('buildId differs across buckets', () => {
    const ttl = 300;
    const ts1 = 0;
    const ts2 = ttl * 1000 + 1;
    const id1 = SignalDedupGuard.buildId('strat', 'BTC-USD', 'BUY', ts1, ttl);
    const id2 = SignalDedupGuard.buildId('strat', 'BTC-USD', 'BUY', ts2, ttl);
    expect(id1).not.toBe(id2);
  });

  it('evictExpired removes stale entries', () => {
    const expired = makeSignal({ id: 'old', expiresAt: Date.now() - 1 });
    const live = makeSignal({ id: 'new', expiresAt: Date.now() + 60_000 });
    guard.isDuplicate(expired);
    guard.isDuplicate(live);
    expect(guard.size).toBe(2);
    guard.evictExpired();
    expect(guard.size).toBe(1);
  });
});
