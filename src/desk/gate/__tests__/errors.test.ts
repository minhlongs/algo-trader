/**
 * License Errors Tests
 * Covers: LicenseError (message-only, all fields, partial fields),
 * RateLimitError (all fields, default remaining).
 */

import { describe, it, expect } from 'vitest';
import { LicenseError, RateLimitError } from '../errors';
import { LicenseTier } from '../../../shared/types/license';

// ─── LicenseError ─────────────────────────────────────────────────────────────

describe('LicenseError', () => {
  it('creates with message only', () => {
    const err = new LicenseError('denied');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LicenseError);
    expect(err.message).toBe('denied');
    expect(err.name).toBe('LicenseError');
    expect(err.requiredTier).toBeUndefined();
    expect(err.feature).toBeUndefined();
    expect(err.currentTier).toBeUndefined();
  });

  it('creates with requiredTier', () => {
    const err = new LicenseError('tier too low', LicenseTier.PRO);
    expect(err.requiredTier).toBe(LicenseTier.PRO);
    expect(err.feature).toBeUndefined();
    expect(err.currentTier).toBeUndefined();
  });

  it('creates with requiredTier and feature', () => {
    const err = new LicenseError('no access', LicenseTier.ENTERPRISE, 'ml_strategies');
    expect(err.requiredTier).toBe(LicenseTier.ENTERPRISE);
    expect(err.feature).toBe('ml_strategies');
    expect(err.currentTier).toBeUndefined();
  });

  it('creates with all fields', () => {
    const err = new LicenseError(
      'insufficient tier',
      LicenseTier.PRO,
      'premium_data',
      LicenseTier.FREE,
    );
    expect(err.requiredTier).toBe(LicenseTier.PRO);
    expect(err.feature).toBe('premium_data');
    expect(err.currentTier).toBe(LicenseTier.FREE);
  });

  it('is catchable as Error', () => {
    try {
      throw new LicenseError('test', LicenseTier.STARTER, 'feature_x');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(LicenseError);
      expect((e as LicenseError).feature).toBe('feature_x');
    }
  });
});

// ─── RateLimitError ───────────────────────────────────────────────────────────

describe('RateLimitError', () => {
  it('creates with explicit remaining', () => {
    const err = new RateLimitError('rate limited', 30, 100, 5);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.message).toBe('rate limited');
    expect(err.name).toBe('RateLimitError');
    expect(err.retryAfter).toBe(30);
    expect(err.limit).toBe(100);
    expect(err.remaining).toBe(5);
  });

  it('defaults remaining to 0 when omitted', () => {
    const err = new RateLimitError('too many', 60, 50);
    expect(err.retryAfter).toBe(60);
    expect(err.limit).toBe(50);
    expect(err.remaining).toBe(0);
  });

  it('is catchable as Error', () => {
    try {
      throw new RateLimitError('slow down', 10, 200, 12);
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfter).toBe(10);
    }
  });
});
