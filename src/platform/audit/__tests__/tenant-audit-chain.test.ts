import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryResult, PoolClient } from 'pg';

// First, mock the module (hoisted) to make sure they are mock functions
vi.mock('../../db/postgres-client', () => {
  return {
    query: vi.fn(),
    transaction: vi.fn(),
  };
});

// Import the database client and the module under test
import { query, transaction } from '../../db/postgres-client';
import { appendTenantAuditLog, verifyTenantChain, computeTenantAuditHash, canonicalJsonStringify } from '../tenant-audit-log';

interface MockRow {
  id: string;
  tenant_id: string;
  sequence_number: number;
  event_type: string;
  action_by: string;
  reason: string | null;
  metadata: string;
  hash: string;
  previous_hash: string | null;
  created_at: Date;
}

describe('Tenant Audit Log Chain', () => {
  const mockRows: MockRow[] = [];

  beforeEach(() => {
    mockRows.length = 0;

    // Set dynamic mock implementations specifically for this test block
    vi.mocked(query).mockImplementation(async (sql: string, params?: unknown[]) => {
      console.log('DYNAMIC QUERY:', sql, params, 'ROWS:', mockRows.length);
      if (sql.includes('ORDER BY sequence_number DESC')) {
        const tenantId = params?.[0] as string;
        const tenantRows = mockRows.filter(r => r.tenant_id === tenantId);
        if (tenantRows.length === 0) return { rows: [] } as unknown as QueryResult<MockRow>;
        const sorted = [...tenantRows].sort((a, b) => b.sequence_number - a.sequence_number);
        return { rows: [sorted[0]] } as unknown as QueryResult<MockRow>;
      }
      
      if (sql.includes('ORDER BY sequence_number ASC')) {
        const tenantId = params?.[0] as string;
        const tenantRows = mockRows.filter(r => r.tenant_id === tenantId);
        const sorted = [...tenantRows].sort((a, b) => a.sequence_number - b.sequence_number);
        return { rows: sorted } as unknown as QueryResult<MockRow>;
      }
      
      if (sql.includes('INSERT INTO tenant_audit_logs')) {
        const [tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at] = params || [];
        const newRow: MockRow = {
          id: `uuid-${Date.now()}-${Math.random()}`,
          tenant_id: tenant_id as string,
          sequence_number: Number(sequence_number),
          event_type: event_type as string,
          action_by: action_by as string,
          reason: reason as string | null,
          metadata: metadata as string,
          hash: hash as string,
          previous_hash: previous_hash as string | null,
          created_at: created_at as Date,
        };
        mockRows.push(newRow);
        return { rows: [newRow] } as unknown as QueryResult<MockRow>;
      }
      
      return { rows: [] } as unknown as QueryResult<never>;
    });

    vi.mocked(transaction).mockImplementation(async (fn: (client: PoolClient) => Promise<unknown>) => {
      const mockClient = {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          console.log('DYNAMIC TX QUERY:', sql, params, 'ROWS:', mockRows.length);
          if (sql.includes('ORDER BY sequence_number DESC')) {
            const tenantId = params?.[0] as string;
            const tenantRows = mockRows.filter(r => r.tenant_id === tenantId);
            console.log('DYNAMIC TX SELECT MATCHED ROWS:', tenantRows);
            if (tenantRows.length === 0) return { rows: [] } as unknown as QueryResult<MockRow>;
            const sorted = [...tenantRows].sort((a, b) => b.sequence_number - a.sequence_number);
            return { rows: [sorted[0]] } as unknown as QueryResult<MockRow>;
          }
          if (sql.includes('INSERT INTO tenant_audit_logs')) {
            const [tenant_id, sequence_number, event_type, action_by, reason, metadata, hash, previous_hash, created_at] = params || [];
            const newRow: MockRow = {
              id: `uuid-${Date.now()}-${Math.random()}`,
              tenant_id: tenant_id as string,
              sequence_number: Number(sequence_number),
              event_type: event_type as string,
              action_by: action_by as string,
              reason: reason as string | null,
              metadata: metadata as string,
              hash: hash as string,
              previous_hash: previous_hash as string | null,
              created_at: created_at as Date,
            };
            mockRows.push(newRow);
            console.log('DYNAMIC TX INSERTED:', newRow, 'TOTAL ROWS:', mockRows.length);
            return { rows: [newRow] } as unknown as QueryResult<MockRow>;
          }
          return { rows: [] } as unknown as QueryResult<never>;
        })
      };
      return fn(mockClient as unknown as PoolClient);
    });
  });

  describe('canonicalJsonStringify', () => {
    it('should sort keys deterministically', () => {
      const obj1 = { b: 2, a: 1, c: { e: 5, d: 4 } };
      const obj2 = { a: 1, b: 2, c: { d: 4, e: 5 } };
      expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
    });
  });

  describe('appendTenantAuditLog', () => {
    it('should append log with sequence 1 and null previous_hash (genesis)', async () => {
      const log = await appendTenantAuditLog(
        'tenant-genesis',
        'trade_decision',
        'system',
        'Executed buy order',
        { amount: 100 }
      );

      expect(log.sequence_number).toBe(1);
      expect(log.previous_hash).toBeNull();
      expect(log.hash).toBeDefined();
      expect(log.hash.length).toBe(64);
    });

    it('should link sequence 2 to sequence 1 hash', async () => {
      const log1 = await appendTenantAuditLog(
        'tenant-link',
        'trade_decision',
        'system',
        'First action',
        {}
      );

      const log2 = await appendTenantAuditLog(
        'tenant-link',
        'trade_executed',
        'system',
        'Second action',
        {}
      );

      expect(log2.sequence_number).toBe(2);
      expect(log2.previous_hash).toBe(log1.hash);
      expect(log2.hash).not.toBe(log1.hash);
    });

    it('should isolate sequences per tenant', async () => {
      const logA1 = await appendTenantAuditLog('tenant-isolate-A', 'event', 'system', 'A1', {});
      const logB1 = await appendTenantAuditLog('tenant-isolate-B', 'event', 'system', 'B1', {});
      const logA2 = await appendTenantAuditLog('tenant-isolate-A', 'event', 'system', 'A2', {});

      expect(logA1.sequence_number).toBe(1);
      expect(logB1.sequence_number).toBe(1);
      expect(logA2.sequence_number).toBe(2);
    });
  });

  describe('verifyTenantChain', () => {
    it('should return valid true for an intact chain', async () => {
      await appendTenantAuditLog('tenant-intact', 'event', 'system', 'A1', {});
      await appendTenantAuditLog('tenant-intact', 'event', 'system', 'A2', {});
      await appendTenantAuditLog('tenant-intact', 'event', 'system', 'A3', {});

      const result = await verifyTenantChain('tenant-intact');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for broken previous_hash link', async () => {
      await appendTenantAuditLog('tenant-broken', 'event', 'system', 'A1', {});
      await appendTenantAuditLog('tenant-broken', 'event', 'system', 'A2', {});

      const target = mockRows.find(r => r.tenant_id === 'tenant-broken' && r.sequence_number === 2);
      if (target) {
        target.previous_hash = 'corrupted_hash';
      }

      const result = await verifyTenantChain('tenant-broken');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('previous_hash mismatch');
    });

    it('should return invalid for mutated data (hash mismatch)', async () => {
      await appendTenantAuditLog('tenant-mutated', 'event', 'system', 'A1', {});

      const target = mockRows.find(r => r.tenant_id === 'tenant-mutated' && r.sequence_number === 1);
      if (target) {
        target.event_type = 'MUTATED';
      }

      const result = await verifyTenantChain('tenant-mutated');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Hash mismatch');
    });
  });
});
