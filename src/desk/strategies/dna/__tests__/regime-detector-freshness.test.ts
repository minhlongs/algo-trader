/**
 * Tests for regime-detector.ts — isRegimeFresh suite.
 *
 * Verifies the expiry helper: freshness is determined by
 * validUntil timestamp, strict less-than at the boundary.
 */

import { describe, it, expect } from 'vitest';
import { isRegimeFresh } from '../regime-detector.js';
import type { RegimeSnapshot } from '../regime-detector.js';

describe('isRegimeFresh', () => {
  it('returns true when validUntil is null (no expiry)', () => {
    const snap: RegimeSnapshot = {
      regime: 'trending_up',
      regimeConfidence: 0.8,
      dominantTf: '1d',
      validFrom: Date.now(),
      validUntil: null,
      reason: 'no expiry',
    };
    expect(isRegimeFresh(snap, Date.now())).toBe(true);
  });

  it('returns true when now is before validUntil', () => {
    const snap: RegimeSnapshot = {
      regime: 'trending_up',
      regimeConfidence: 0.8,
      dominantTf: '1d',
      validFrom: Date.now(),
      validUntil: Date.now() + 60_000,
      reason: 'fresh',
    };
    expect(isRegimeFresh(snap, Date.now() + 30_000)).toBe(true);
  });

  it('returns false when now is past validUntil', () => {
    const snap: RegimeSnapshot = {
      regime: 'trending_up',
      regimeConfidence: 0.8,
      dominantTf: '1d',
      validFrom: Date.now(),
      validUntil: Date.now() + 30_000,
      reason: 'about to expire',
    };
    expect(isRegimeFresh(snap, Date.now() + 60_000)).toBe(false);
  });

  it('returns false exactly at validUntil boundary (strict less-than)', () => {
    const ts = Date.now();
    const snap: RegimeSnapshot = {
      regime: 'ranging',
      regimeConfidence: 0.5,
      dominantTf: '1d',
      validFrom: ts,
      validUntil: ts + 10_000,
      reason: 'boundary',
    };
    expect(isRegimeFresh(snap, ts + 10_000)).toBe(false);
  });
});
