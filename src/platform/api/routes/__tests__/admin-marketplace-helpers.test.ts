/**
 * Admin Marketplace Helpers Tests
 * Covers: getTenantId, getUserId, isAdmin, getQueryString.
 */

import { describe, it, expect } from 'vitest';
import { getTenantId, getUserId, isAdmin, getQueryString } from '../admin-marketplace-helpers';

// ─── getTenantId ─────────────────────────────────────────────────────────────

describe('getTenantId', () => {
  it('returns tenant.id from request', () => {
    const req = { tenant: { id: 'tenant_001' } } as any;
    expect(getTenantId(req)).toBe('tenant_001');
  });

  it('falls back to user.tenantId', () => {
    const req = { user: { tenantId: 'tenant_002' } } as any;
    expect(getTenantId(req)).toBe('tenant_002');
  });

  it('throws when no tenant context', () => {
    const req = {} as any;
    expect(() => getTenantId(req)).toThrow('Unauthorized: No tenant context');
  });
});

// ─── getUserId ───────────────────────────────────────────────────────────────

describe('getUserId', () => {
  it('returns user.id from request', () => {
    const req = { user: { id: 'user_001' } } as any;
    expect(getUserId(req)).toBe('user_001');
  });

  it('falls back to apiKey.userId', () => {
    const req = { apiKey: { userId: 'user_002' } } as any;
    expect(getUserId(req)).toBe('user_002');
  });

  it('throws when no user context', () => {
    const req = {} as any;
    expect(() => getUserId(req)).toThrow('Unauthorized: No user context');
  });
});

// ─── isAdmin ─────────────────────────────────────────────────────────────────

describe('isAdmin', () => {
  it('returns true when user.role is admin', () => {
    const req = { user: { role: 'admin' } } as any;
    expect(isAdmin(req)).toBe(true);
  });

  it('returns true when apiKey.isAdmin is true', () => {
    const req = { apiKey: { isAdmin: true } } as any;
    expect(isAdmin(req)).toBe(true);
  });

  it('returns false when neither admin flag set', () => {
    const req = { user: { role: 'member' } } as any;
    expect(isAdmin(req)).toBe(false);
  });

  it('returns false when request is empty', () => {
    const req = {} as any;
    expect(isAdmin(req)).toBe(false);
  });
});

// ─── getQueryString ──────────────────────────────────────────────────────────

describe('getQueryString', () => {
  it('returns default when value is undefined', () => {
    expect(getQueryString(undefined, 'fallback')).toBe('fallback');
  });

  it('returns default when value is null', () => {
    expect(getQueryString(null, 'fallback')).toBe('fallback');
  });

  it('returns default when value is undefined and no default given', () => {
    expect(getQueryString(undefined)).toBe('');
  });

  it('returns first element when value is array', () => {
    expect(getQueryString(['a', 'b'])).toBe('a');
  });

  it('returns stringified first element when array element is number', () => {
    expect(getQueryString([42])).toBe('42');
  });

  it('returns value when string', () => {
    expect(getQueryString('hello')).toBe('hello');
  });

  it('returns stringified value when number', () => {
    expect(getQueryString(123)).toBe('123');
  });
});