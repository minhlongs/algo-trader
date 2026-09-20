/**
 * Unit tests for isProductionError and sensitive pattern detection
 */

import { describe, it, expect } from 'vitest';
import { isProductionError } from '../error-sanitize';

describe('error-sanitize — isProductionError', () => {
  it('ignores stack traces — only checks message (by design)', () => {
    const err = new Error('fail');
    err.stack = 'Error: fail\n    at /src/secret.ts:10';

    expect(isProductionError(err)).toBe(false);
  });

  it('detects sensitive patterns in error messages', () => {
    expect(isProductionError(new Error('password is required'))).toBe(true);
    expect(isProductionError(new Error('apikey is invalid'))).toBe(true);
    expect(isProductionError(new Error('api_key missing'))).toBe(true);
    expect(isProductionError(new Error('postgres://user:pass@host/db'))).toBe(true);
  });

  it('detects connection strings as sensitive', () => {
    expect(isProductionError('postgres://admin:password@db.internal:5432/prod')).toBe(true);
  });

  it('allows clean error messages', () => {
    expect(isProductionError('Invalid input')).toBe(false);
  });

  it('detects sensitive patterns in serialized object', () => {
    expect(isProductionError({ apiKey: 'secret-123' })).toBe(true);
    expect(isProductionError({ password: 'hunter2' })).toBe(true);
  });

  it('returns false for clean objects', () => {
    expect(isProductionError({ count: 5, name: 'test' })).toBe(false);
  });

  it('returns false for null, undefined, numbers, and booleans', () => {
    expect(isProductionError(null)).toBe(false);
    expect(isProductionError(undefined)).toBe(false);
    expect(isProductionError(42)).toBe(false);
    expect(isProductionError(true)).toBe(false);
  });
});
