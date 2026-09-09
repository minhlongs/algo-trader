/**
 * Signal Tier Filter — unit tests
 * Verifies tier-based visibility: FREE=daily digest, PRO=hourly, ENTERPRISE=realtime
 */

import { describe, it, expect } from 'vitest';
import { filterSignalsForTier, canAccessSse, shouldPushRealtime } from '../signal-tier-filter';
import type { Signal } from '../signal-types';

const now = Date.now();

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: Math.random().toString(36).slice(2),
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

describe('filterSignalsForTier - ENTERPRISE', () => {
  it('returns all live signals above min confidence (0.5)', () => {
    const sigs = [
      makeSignal({ confidence: 0.9 }),
      makeSignal({ confidence: 0.5 }),
      makeSignal({ confidence: 0.4 }), // below threshold
    ];
    const result = filterSignalsForTier(sigs, 'ENTERPRISE');
    expect(result).toHaveLength(2);
  });

  it('excludes expired signals', () => {
    const sigs = [
      makeSignal({ expiresAt: now - 1 }),   // expired
      makeSignal({ expiresAt: now + 1000 }), // live
    ];
    const result = filterSignalsForTier(sigs, 'ENTERPRISE');
    expect(result).toHaveLength(1);
  });
});

describe('filterSignalsForTier - PRO', () => {
  it('only shows signals within last hour', () => {
    const oneHourAgo = now - 60 * 60 * 1000;
    const sigs = [
      makeSignal({ ts: now - 30 * 60 * 1000 }),       // 30 min ago — visible
      makeSignal({ ts: oneHourAgo - 1, confidence: 0.7 }), // just over 1h — hidden
    ];
    const result = filterSignalsForTier(sigs, 'PRO');
    expect(result).toHaveLength(1);
  });

  it('min confidence is 0.6 for PRO', () => {
    const sigs = [
      makeSignal({ confidence: 0.6 }),  // exactly at threshold — visible
      makeSignal({ confidence: 0.59 }), // below — hidden
    ];
    const result = filterSignalsForTier(sigs, 'PRO');
    expect(result).toHaveLength(1);
  });

  it('PRO sorts visible signals by ts descending', () => {
    const sigs = [
      makeSignal({ ts: now - 10 * 60 * 1000, id: 'older' }),  // 10 min ago
      makeSignal({ ts: now - 5 * 60 * 1000, id: 'newer' }),   // 5 min ago
    ];
    const result = filterSignalsForTier(sigs, 'PRO');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('newer');
    expect(result[1].id).toBe('older');
  });
});

describe('filterSignalsForTier - FREE', () => {
  it('returns only most recent signal per market (daily digest)', () => {
    const older = makeSignal({ ts: now - 1000, market: 'BTC-USD', id: 'old' });
    const newer = makeSignal({ ts: now, market: 'BTC-USD', id: 'new' });
    const other = makeSignal({ market: 'ETH-USD' });

    const result = filterSignalsForTier([older, newer, other], 'FREE');
    // 2 unique markets, newest per market
    expect(result).toHaveLength(2);
    const btcResult = result.find((s) => s.market === 'BTC-USD');
    expect(btcResult?.id).toBe('new');
  });

  it('keeps existing newer signal when older signal for same market arrives later', () => {
    const newer = makeSignal({ ts: now, market: 'BTC-USD', id: 'newer' });
    const older = makeSignal({ ts: now - 1000, market: 'BTC-USD', id: 'older' });
    // newer arrives first → map has newer; older arrives → must NOT replace
    const result = filterSignalsForTier([newer, older], 'FREE');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('newer');
  });

  it('min confidence is 0.7 for FREE', () => {
    const sigs = [
      makeSignal({ confidence: 0.7 }),  // visible
      makeSignal({ confidence: 0.69 }), // hidden
    ];
    const result = filterSignalsForTier(sigs, 'FREE');
    expect(result).toHaveLength(1);
  });
});

describe('canAccessSse', () => {
  it('only ENTERPRISE can access SSE', () => {
    expect(canAccessSse('ENTERPRISE')).toBe(true);
    expect(canAccessSse('PRO')).toBe(false);
    expect(canAccessSse('FREE')).toBe(false);
  });
});

describe('shouldPushRealtime', () => {
  it('only ENTERPRISE gets realtime push', () => {
    expect(shouldPushRealtime('ENTERPRISE')).toBe(true);
    expect(shouldPushRealtime('PRO')).toBe(false);
    expect(shouldPushRealtime('FREE')).toBe(false);
  });
});
