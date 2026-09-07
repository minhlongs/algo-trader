/**
 * Tests for DisputeRepository
 * Covers: findById, findAll (with filters/sort/pagination), create,
 *         update (with column mapping, empty fields), delete, count
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock('../../../shared/db/postgres-client', () => ({
  query: mockQuery,
}));

import { DisputeRepository } from '../repositories/dispute-repository';

function mockResult(rows: unknown[] = [], rowCount?: number) {
  return { rows, rowCount: rowCount ?? rows.length } as never;
}

describe('DisputeRepository', () => {
  let repo: DisputeRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DisputeRepository();
  });

  // ── findById ──

  describe('findById', () => {
    it('returns dispute when found', async () => {
      const dispute = { id: 'd1', status: 'open' };
      mockQuery.mockResolvedValueOnce(mockResult([dispute]));

      const result = await repo.findById('d1');

      expect(result).toEqual(dispute);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['d1'],
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await repo.findById('missing');
      expect(result).toBeNull();
    });
  });

  // ── findAll ──

  describe('findAll', () => {
    it('returns paginated results with default pagination', async () => {
      const disputes = [{ id: 'd1' }, { id: 'd2' }];
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 2 }]))
        .mockResolvedValueOnce(mockResult(disputes));

      const result = await repo.findAll();

      expect(result.data).toEqual(disputes);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('applies tenantId filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ tenantId: 't1' });

      expect(mockQuery.mock.calls[0][0]).toContain('tenant_id = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('t1');
    });

    it('applies listingId filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ listingId: 'l1' });

      expect(mockQuery.mock.calls[0][0]).toContain('listing_id = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('l1');
    });

    it('applies subscriptionId filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ subscriptionId: 's1' });

      expect(mockQuery.mock.calls[0][0]).toContain('subscription_id = $1');
    });

    it('applies status filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ status: 'resolved' });

      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });

    it('applies reason filter', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ reason: 'fraud' });

      expect(mockQuery.mock.calls[0][0]).toContain('reason = $1');
    });

    it('applies multiple filters combined', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll({ tenantId: 't1', status: 'open', reason: 'fraud' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id = $1');
      expect(sql).toContain('status = $2');
      expect(sql).toContain('reason = $3');
    });

    it('applies custom sort', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll(undefined, undefined, { field: 'updated_at', order: 'asc' });

      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY updated_at asc');
    });

    it('uses default sort (created_at desc)', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockResult([]));

      await repo.findAll();

      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY created_at desc');
    });

    it('applies custom pagination', async () => {
      mockQuery
        .mockResolvedValueOnce(mockResult([{ total: 50 }]))
        .mockResolvedValueOnce(mockResult([]));

      const result = await repo.findAll(undefined, { page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(5);
      const dataSql = mockQuery.mock.calls[1][0];
      expect(dataSql).toContain('LIMIT');
      expect(dataSql).toContain('OFFSET');
    });
  });

  // ── create ──

  describe('create', () => {
    it('inserts a dispute with all fields', async () => {
      const dispute = { id: 'd1', status: 'open' };
      mockQuery.mockResolvedValueOnce(mockResult([dispute]));

      const result = await repo.create({
        id: 'd1',
        tenantId: 't1',
        listingId: 'l1',
        subscriptionId: 's1',
        reason: 'fraud',
        description: 'Evidence of fraud',
        evidenceUrls: ['https://img/1.png'],
      });

      expect(result).toEqual(dispute);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['d1', 't1', 'l1', 's1', 'fraud', 'Evidence of fraud', ['https://img/1.png']]),
      );
    });

    it('uses empty array default for evidenceUrls', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 'd2' }]));

      await repo.create({
        id: 'd2',
        tenantId: 't1',
        listingId: 'l1',
        subscriptionId: 's1',
        reason: 'other',
        description: 'No evidence',
      });

      const params = mockQuery.mock.calls[0][1];
      expect(params[6]).toEqual([]);
    });
  });

  // ── update ──

  describe('update', () => {
    it('updates mapped fields (camelCase → snake_case)', async () => {
      const updated = { id: 'd1', status: 'resolved' };
      mockQuery.mockResolvedValueOnce(mockResult([updated]));

      const result = await repo.update('d1', {
        status: 'resolved_subscriber',
        resolution: 'refund issued',
        resolvedBy: 'admin_1',
      });

      expect(result).toEqual(updated);
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('status = $1');
      expect(sql).toContain('resolution = $2');
      expect(sql).toContain('resolved_by = $3');
      expect(sql).toContain('WHERE id = $4');
    });

    it('updates compensation fields', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 'd1' }]));

      await repo.update('d1', {
        compensationAmountCents: 5000,
        compensationType: 'partial_refund',
      });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('compensation_amount_cents = $1');
      expect(sql).toContain('compensation_type = $2');
    });

    it('updates adminNotes', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 'd1' }]));

      await repo.update('d1', { adminNotes: 'Reviewed and closed' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('admin_notes = $1');
    });

    it('updates resolvedAt field', async () => {
      const ts = '2024-06-15T10:00:00Z';
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 'd1' }]));

      await repo.update('d1', { resolvedAt: ts });

      expect(mockQuery.mock.calls[0][1][0]).toBe(ts);
    });

    it('returns findById result when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ id: 'd1' }]));

      const result = await repo.update('d1', {});

      expect(result).toEqual({ id: 'd1' });
      expect(mockQuery.mock.calls[0][0]).toContain('SELECT *');
    });

    it('returns null when update returns empty result', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([]));

      const result = await repo.update('missing', { status: 'closed' });
      expect(result).toBeNull();
    });
  });

  // ── delete ──

  describe('delete', () => {
    it('returns true when row is deleted', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([], 1));

      const result = await repo.delete('d1');
      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        ['d1'],
      );
    });

    it('returns false when no rows deleted', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([], 0));

      const result = await repo.delete('missing');
      expect(result).toBe(false);
    });

    it('handles null rowCount', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: null } as never);

      const result = await repo.delete('d1');
      expect(result).toBe(false);
    });
  });

  // ── count ──

  describe('count', () => {
    it('counts all when no filters', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 42 }]));

      const result = await repo.count();
      expect(result).toBe(42);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)'),
        [],
      );
    });

    it('counts with tenantId filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 5 }]));

      const result = await repo.count({ tenantId: 't1' });
      expect(result).toBe(5);
      expect(mockQuery.mock.calls[0][0]).toContain('tenant_id = $1');
    });

    it('counts with status filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 3 }]));

      await repo.count({ status: 'open' });
      expect(mockQuery.mock.calls[0][0]).toContain('status = $1');
    });

    it('counts with listingId filter', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 7 }]));

      await repo.count({ listingId: 'l1' });
      expect(mockQuery.mock.calls[0][0]).toContain('listing_id = $1');
    });

    it('counts with multiple filters', async () => {
      mockQuery.mockResolvedValueOnce(mockResult([{ total: 2 }]));

      await repo.count({ tenantId: 't1', status: 'open', listingId: 'l1' });

      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('tenant_id = $1');
      expect(sql).toContain('status = $2');
      expect(sql).toContain('listing_id = $3');
    });
  });

  // ── singleton export ──

  describe('singleton export', () => {
    it('exports disputeRepository instance', async () => {
      const { disputeRepository } = await import('../repositories/dispute-repository');
      expect(disputeRepository).toBeInstanceOf(DisputeRepository);
    });
  });
});
