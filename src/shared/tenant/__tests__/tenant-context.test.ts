import { describe, it, expect } from 'vitest';
import { validateTenantId, resolveTenant, tenantResourceKey, validateResourceKey } from '../context';
import type { TenantId } from '../types';

describe('validateTenantId', () => {
  const validIds: unknown[] = ['tenant-abc', 'tenant_123', 'ABC', 'abc123', 'a-b_c'];
  const invalidIds: unknown[] = ['', 'a'.repeat(129), 'tenant/../etc', 'tenant.txt', 'has spaces', 123, null, undefined];

  it.each(validIds)('accepts valid id: %s', (id) => {
    expect(validateTenantId(id)).toBe(true);
  });

  it.each(invalidIds)('rejects invalid id: %s', (id) => {
    expect(validateTenantId(id)).toBe(false);
  });
});

describe('resolveTenant', () => {
  it('resolves from apiKeyAuth (highest priority)', () => {
    const req = {
      apiKeyAuth: { tenantId: 'tenant-x', keyId: 'k1', label: 'main' },
      user: { tenantId: 'tenant-z', role: 'admin' },
      headers: { 'x-tenant-id': 'tenant-w' },
    };
    const ctx = resolveTenant(req as unknown as Record<string, unknown>);
    expect(ctx.tenantId).toBe('tenant-x');
    expect(ctx.source).toBe('api-key');
    expect(ctx.keyLabel).toBe('main');
  });

  it('falls back to user session', () => {
    const req = { apiKeyAuth: undefined, user: { tenantId: 'tenant-z', role: 'admin' } };
    const ctx = resolveTenant(req as unknown as Record<string, unknown>);
    expect(ctx.tenantId).toBe('tenant-z');
    expect(ctx.source).toBe('user-session');
  });

  it('falls back to header', () => {
    const req = {
      apiKeyAuth: undefined,
      user: undefined,
      headers: { 'x-tenant-id': 'tenant-w' },
      'x-tenant-id': 'tenant-w',
    };
    const ctx = resolveTenant(req as unknown as Record<string, unknown>);
    expect(ctx.tenantId).toBe('tenant-w');
    expect(ctx.source).toBe('header');
  });

  it('returns null when no valid source', () => {
    const req = { apiKeyAuth: undefined, user: undefined };
    const ctx = resolveTenant(req as unknown as Record<string, unknown>);
    expect(ctx.tenantId).toBeNull();
    expect(ctx.source).toBe('none');
  });

  it('rejects invalid tenant IDs at every source', () => {
    const req = {
      apiKeyAuth: { tenantId: 'evil/../etc', keyId: 'k1', label: 'x' },
      user: { tenantId: 'tenant.txt' },
    };
    const ctx = resolveTenant(req as unknown as Record<string, unknown>);
    expect(ctx.tenantId).toBeNull();
  });
});

describe('tenantResourceKey', () => {
  it('scopes resource names', () => {
    expect(tenantResourceKey('tenant-abc' as TenantId, 'events')).toBe('tenant-abc:events');
    expect(tenantResourceKey('tenant-abc' as TenantId, 'config')).toBe('tenant-abc:config');
  });
});

describe('validateResourceKey', () => {
  it('accepts keys from correct tenant', () => {
    expect(validateResourceKey('tenant-abc:events', 'tenant-abc' as TenantId)).toBe(true);
  });
  it('rejects keys from wrong tenant', () => {
    expect(validateResourceKey('tenant-abc:events', 'tenant-x' as TenantId)).toBe(false);
  });
  it('rejects malformed keys', () => {
    expect(validateResourceKey('', 'tenant-x' as TenantId)).toBe(false);
    expect(validateResourceKey('no-colon', 'tenant-x' as TenantId)).toBe(false);
  });
});
