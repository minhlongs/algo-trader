/**
 * Tier rate-limit config — unit tests
 * Verifies TIER_RATE_LIMITS mapping and resolveLimits fallback for unknown tiers.
 */

import { describe, it, expect } from 'vitest';
import { TIER_RATE_LIMITS, DEFAULT_TIER_LIMITS, resolveLimits } from '../tier-config';

describe('TIER_RATE_LIMITS', () => {
  it('FREE tier: 10/min, 2/sec', () => {
    expect(TIER_RATE_LIMITS.FREE).toEqual({ requestsPerMin: 10, burstPerSec: 2 });
  });

  it('PRO tier: 100/min, 20/sec', () => {
    expect(TIER_RATE_LIMITS.PRO).toEqual({ requestsPerMin: 100, burstPerSec: 20 });
  });

  it('ENTERPRISE tier: 1000/min, 100/sec', () => {
    expect(TIER_RATE_LIMITS.ENTERPRISE).toEqual({ requestsPerMin: 1000, burstPerSec: 100 });
  });

  it('MASTER tier: unlimited (0/min, 0/sec)', () => {
    expect(TIER_RATE_LIMITS.MASTER).toEqual({ requestsPerMin: 0, burstPerSec: 0 });
  });
});

describe('DEFAULT_TIER_LIMITS', () => {
  it('matches FREE tier (never more permissive)', () => {
    expect(DEFAULT_TIER_LIMITS).toEqual({ requestsPerMin: 10, burstPerSec: 2 });
  });
});

describe('resolveLimits', () => {
  it('resolves known tiers case-insensitively', () => {
    expect(resolveLimits('free')).toEqual(TIER_RATE_LIMITS.FREE);
    expect(resolveLimits('PRO')).toEqual(TIER_RATE_LIMITS.PRO);
    expect(resolveLimits('enterprise')).toEqual(TIER_RATE_LIMITS.ENTERPRISE);
    expect(resolveLimits('Master')).toEqual(TIER_RATE_LIMITS.MASTER);
  });

  it('falls back to DEFAULT_TIER_LIMITS for unrecognized tier', () => {
    // Covers the `?? DEFAULT_TIER_LIMITS` branch (line 60)
    expect(resolveLimits('GOLD')).toEqual(DEFAULT_TIER_LIMITS);
    expect(resolveLimits('')).toEqual(DEFAULT_TIER_LIMITS);
    expect(resolveLimits('unknown')).toEqual(DEFAULT_TIER_LIMITS);
  });
});
