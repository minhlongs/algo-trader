/**
 * Subscriber Tenant Isolator Tests
 * Critical: verifies cross-tenant data access is rejected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildTenantFilter,
  assertTenantAccess,
  tenantQuery,
} from '../subscriber-tenant-isolator';

// Mock postgres-client so tests don't need a real DB
vi.mock('../../db/postgres-client', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/postgres-client';
const mockQuery = vi.mocked(query);

describe('buildTenantFilter', () => {
  it('returns correct clause for startIndex=1', () => {
    const f = buildTenantFilter('sub-abc', 1);
    expect(f.subscriberId).toBe('sub-abc');
    expect(f.clause).toBe('AND subscriber_id = $1');
    expect(f.paramIndex).toBe(1);
  });

  it('returns correct clause for startIndex=3', () => {
    const f = buildTenantFilter('sub-xyz', 3);
    expect(f.clause).toBe('AND subscriber_id = $3');
  });

  it('throws on empty subscriberId', () => {
    expect(() => buildTenantFilter('')).toThrow('must be a non-empty string');
  });

  it('throws on whitespace-only subscriberId', () => {
    expect(() => buildTenantFilter('   ')).toThrow('must be a non-empty string');
  });
});

describe('assertTenantAccess', () => {
  it('allows matching subscriber', () => {
    expect(() => assertTenantAccess('sub-1', 'sub-1', false)).not.toThrow();
  });

  it('allows admin to access any subscriber', () => {
    expect(() => assertTenantAccess('sub-2', 'sub-1', true)).not.toThrow();
  });

  it('rejects cross-tenant access', () => {
    expect(() => assertTenantAccess('sub-2', 'sub-1', false)).toThrow(
      'cross-tenant access denied'
    );
  });

  it('rejects when token has no subscriber identity', () => {
    expect(() => assertTenantAccess('sub-1', null, false)).toThrow(
      'no subscriber identity in token'
    );
  });

  it('rejects undefined token subscriber', () => {
    expect(() => assertTenantAccess('sub-1', undefined, false)).toThrow(
      'no subscriber identity in token'
    );
  });
});

describe('tenantQuery', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('injects subscriber_id into params and SQL', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'row-1' }] } as never);

    const filter = buildTenantFilter('tenant-abc', 2);
    const sql = 'SELECT * FROM trades WHERE status = $1 /*TENANT*/';
    await tenantQuery(sql, ['FILLED'], filter);

    const [calledSql, calledParams] = mockQuery.mock.calls[0];
    expect(calledSql).toContain('AND subscriber_id = $2');
    expect(calledSql).not.toContain('/*TENANT*/');
    expect(calledParams).toContain('tenant-abc');
    expect(calledParams).toContain('FILLED');
  });

  it('returns rows from query result', async () => {
    const fakeRows = [{ id: 'r1' }, { id: 'r2' }];
    mockQuery.mockResolvedValue({ rows: fakeRows } as never);

    const filter = buildTenantFilter('sub-x', 1);
    const result = await tenantQuery('SELECT * FROM trades WHERE 1=1 /*TENANT*/', [], filter);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ id: 'r1' });
  });

  it('NEVER leaks other tenant rows — query is always scoped', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);

    const filterA = buildTenantFilter('sub-A', 1);
    await tenantQuery('SELECT * FROM trades WHERE 1=1 /*TENANT*/', [], filterA);

    const [, params] = mockQuery.mock.calls[0];
    // Only sub-A's id should appear in params
    expect(params).toContain('sub-A');
    expect(params).not.toContain('sub-B');
  });
});
