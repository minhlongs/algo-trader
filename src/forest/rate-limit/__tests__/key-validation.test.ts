/**
 * Tests for key-prefix validation.
 * Target: 100% coverage for src/forest/rate-limit/key-validation.ts
 */

import { describe, it, expect } from 'vitest';
import { validateKeyPrefix } from '../key-validation';

describe('validateKeyPrefix', () => {
  it('returns empty string for undefined prefix', () => {
    expect(validateKeyPrefix(undefined)).toBe('');
  });

  it('returns empty string for empty string prefix', () => {
    expect(validateKeyPrefix('')).toBe('');
  });

  it('returns valid alphanumeric prefix unchanged', () => {
    expect(validateKeyPrefix('abc123')).toBe('abc123');
  });

  it('returns prefix with hyphens and underscores unchanged', () => {
    expect(validateKeyPrefix('my-key_name')).toBe('my-key_name');
  });

  it('throws on prefix containing spaces', () => {
    expect(() => validateKeyPrefix('bad key')).toThrow(
      '[RateLimiter] Invalid keyPrefix "bad key" — use alphanumeric, hyphens or underscores only',
    );
  });

  it('throws on prefix containing a colon', () => {
    expect(() => validateKeyPrefix('bad:key')).toThrow(
      '[RateLimiter] Invalid keyPrefix "bad:key" — use alphanumeric, hyphens or underscores only',
    );
  });

  it('throws on prefix containing a slash', () => {
    expect(() => validateKeyPrefix('bad/key')).toThrow(
      '[RateLimiter] Invalid keyPrefix "bad/key" — use alphanumeric, hyphens or underscores only',
    );
  });

  it('throws on prefix containing a dot', () => {
    expect(() => validateKeyPrefix('bad.key')).toThrow(
      '[RateLimiter] Invalid keyPrefix "bad.key" — use alphanumeric, hyphens or underscores only',
    );
  });
});