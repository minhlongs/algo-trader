import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// First, mock the module (hoisted) to make sure they are mock functions
vi.mock('../../../shared/db/postgres-client', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

import { query, transaction } from '../../../shared/db/postgres-client';
import { appendTenantAuditLog, verifyTenantChain, canonicalJsonStringify } from '../tenant-audit-log';
import {
  MockRow,
  createMockQueryHandler,
  createMockTransactionHandler,
} from './tenant-audit-chain-fixtures';

describe('Tenant Audit Log Chain', () => {
  const mockRows: MockRow[] = [];
  const fixedTimestamp = new Date('2026-08-11T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTimestamp);
    mockRows.length = 0;

    vi.mocked(query).mockImplementation(createMockQueryHandler(mockRows) as never);
    vi.mocked(transaction).mockImplementation(createMockTransactionHandler(mockRows, fixedTimestamp));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
