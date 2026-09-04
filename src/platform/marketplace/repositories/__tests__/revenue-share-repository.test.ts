/**
 * Tests for RevenueShareRepository — mocked `query` so all methods are exercised
 * without a live database. Verifies SQL shape, param binding, and result mapping.
 * Target: 100% coverage for src/platform/marketplace/repositories/revenue-share-repository.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../../shared/db/postgres-client', () => ({
  query: vi.fn((...args: unknown[]) => mockQuery(...args)),
}));

import { RevenueShareRepository, revenueShareRepository } from '../revenue-share-repository';
import type { IMarketplaceRevenueShare, RevenueShareStatus, PaginationParams, SortOrder } from '../models/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const REVENUE_SHARE_RECORD: IMarketplaceRevenueShare = {
  id: 'rev_001',
  strategyId: 'strat-1',
  tenantId: 'tenant_001',
  subscriptionId: 'sub_001',
  periodStart: new Date('2026-08-01T00:00:00Z'),
  periodEnd: new Date('2026-08-31T23:59:59Z'),
  grossRevenueCents: 10000,
  platformShareCents: 8000,
  creatorShareCents: 2000,
  status: 'pending' as RevenueShareStatus,
  paidAt: undefined,
  stripePayoutId: undefined,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('RevenueShareRepository', () => {
  let repo: RevenueShareRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new RevenueShareRepository();
  });

  it('exposes a module-level singleton instance', () => {
    expect(revenueShareRepository).toBeInstanceOf(RevenueShareRepository);
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the record when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVENUE_SHARE_RECORD] });
      const result = await repo.findById('rev_001');
      expect(result).toEqual(REVENUE_SHARE_RECORD);
    });

    it('returns null when no rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('uses table marketplace_revenue_shares and param id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await repo.findById('rev_002');
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_revenue_shares');
      expect(sql).toContain('WHERE id = $1');
      expect(params).toEqual(['rev_002']);
    });
  });

  // ─── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated result with defaults (limit 20, page 1, period_start desc)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 30 }] })  // count
        .mockResolvedValueOnce({ rows: [REVENUE_SHARE_RECORD] });  // data
      const result = await repo.findAll();
      expect(result).toEqual({
        data: [REVENUE_SHARE_RECORD],
        total: 30,
        page: 1,
        limit: 20,
        totalPages: 2,
      });
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY period_start desc');
      expect(dataParams.slice(-2)).toEqual([20, 0]);
    });

    it('applies all filters with AND and increments param indexes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [REVENUE_SHARE_RECORD] });
      await repo.findAll(
        { strategyId: 's1', tenantId: 't1', subscriptionId: 'sub1', status: 'paid', periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-31') },
        { limit: 10, page: 3 },
        { field: 'id', order: 'asc' },
      );
      const [countSql, countParams] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1 AND tenant_id = $2 AND subscription_id = $3 AND status = $4 AND period_start >= $5 AND period_end <= $6');
      expect(countParams.slice(0, 6)).toEqual(['s1', 't1', 'sub1', 'paid', new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-31T00:00:00.000Z')]);
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('ORDER BY id asc');
      expect(dataSql).toContain('LIMIT $7 OFFSET $8');
      expect(dataParams).toEqual(['s1', 't1', 'sub1', 'paid', new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-31T00:00:00.000Z'), 10, 20]);
    });

    it('supports single filter strategyId only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ strategyId: 's1' }, { limit: 5, page: 1 });
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(1);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE strategy_id = $1');
    });

    it('supports single filter tenantId only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ tenantId: 't1' });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE tenant_id = $1');
    });

    it('supports single filter subscriptionId only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ subscriptionId: 'sub1' });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE subscription_id = $1');
    });

    it('supports single filter status only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ status: 'paid' });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE status = $1');
    });

    it('supports single filter periodStart only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ periodStart: new Date('2026-08-01') });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE period_start >= $1');
    });

    it('supports single filter periodEnd only', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({ periodEnd: new Date('2026-08-31') });
      expect(result.totalPages).toBe(0);
      const [countSql] = mockQuery.mock.calls[0];
      expect(countSql).toContain('WHERE period_end <= $1');
    });

    it('computes totalPages with ceiling division', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 41 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll(undefined, { limit: 20 });
      expect(result.totalPages).toBe(3);
    });

    it('offset is zero when page is 1', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 10 }] })
        .mockResolvedValueOnce({ rows: [] });
      await repo.findAll(undefined, { limit: 10, page: 1 });
      const [dataSql, dataParams] = mockQuery.mock.calls[1];
      expect(dataSql).toContain('OFFSET $2');
      expect(dataParams.slice(-2)).toEqual([10, 0]);
    });

    it('handles zero total gracefully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll({});
      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
    });

    it('parses string total from COUNT(*)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '7' }] })
        .mockResolvedValueOnce({ rows: [] });
      const result = await repo.findAll();
      expect(result.total).toBe(7);
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('inserts with all fields and returns the new record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVENUE_SHARE_RECORD] });
      const result = await repo.create({
        id: 'rev_001',
        strategyId: 'strat-1',
        tenantId: 'tenant_001',
        subscriptionId: 'sub_001',
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-08-31T23:59:59Z'),
        grossRevenueCents: 10000,
        platformShareCents: 8000,
        creatorShareCents: 2000,
        status: 'pending',
      });
      expect(result).toEqual(REVENUE_SHARE_RECORD);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO marketplace_revenue_shares');
      expect(sql).toContain('NOW()');
      expect(params).toEqual([
        'rev_001',
        'strat-1',
        'tenant_001',
        'sub_001',
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-31T23:59:59.000Z'),
        10000,
        8000,
        2000,
        'pending',
      ]);
    });

    it('uses default status "pending" when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...REVENUE_SHARE_RECORD, status: 'pending' }] });
      await repo.create({
        id: 'rev_002',
        strategyId: 'strat-1',
        tenantId: 'tenant_001',
        subscriptionId: 'sub_001',
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-08-31T23:59:59Z'),
        grossRevenueCents: 5000,
        platformShareCents: 4000,
        creatorShareCents: 1000,
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[9]).toBe('pending');
    });

    it('uses provided status when given', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...REVENUE_SHARE_RECORD, status: 'paid' }] });
      await repo.create({
        id: 'rev_003',
        strategyId: 'strat-1',
        tenantId: 'tenant_001',
        subscriptionId: 'sub_001',
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-08-31T23:59:59Z'),
        grossRevenueCents: 5000,
        platformShareCents: 4000,
        creatorShareCents: 1000,
        status: 'paid',
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params[9]).toBe('paid');
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates status only and returns updated record', async () => {
      const updatedRecord = { ...REVENUE_SHARE_RECORD, status: 'paid' as RevenueShareStatus };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRecord] });
      const result = await repo.update('rev_001', { status: 'paid' });
      expect(result).toEqual(updatedRecord);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_revenue_shares SET status = $1 WHERE id = $2 RETURNING *');
      expect(params).toEqual(['paid', 'rev_001']);
    });

    it('updates paidAt only and returns updated record', async () => {
      const paidAt = new Date('2026-09-01T00:00:00Z');
      const updatedRecord = { ...REVENUE_SHARE_RECORD, paidAt };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRecord] });
      const result = await repo.update('rev_001', { paidAt });
      expect(result).toEqual(updatedRecord);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_revenue_shares SET paid_at = $1 WHERE id = $2 RETURNING *');
      expect(params).toEqual([paidAt, 'rev_001']);
    });

    it('updates stripePayoutId only and returns updated record', async () => {
      const updatedRecord = { ...REVENUE_SHARE_RECORD, stripePayoutId: 'po_123' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRecord] });
      const result = await repo.update('rev_001', { stripePayoutId: 'po_123' });
      expect(result).toEqual(updatedRecord);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_revenue_shares SET stripe_payout_id = $1 WHERE id = $2 RETURNING *');
      expect(params).toEqual(['po_123', 'rev_001']);
    });

    it('updates multiple fields at once', async () => {
      const paidAt = new Date('2026-09-01T00:00:00Z');
      const updatedRecord = { ...REVENUE_SHARE_RECORD, status: 'paid' as RevenueShareStatus, paidAt, stripePayoutId: 'po_123' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRecord] });
      const result = await repo.update('rev_001', { status: 'paid', paidAt, stripePayoutId: 'po_123' });
      expect(result).toEqual(updatedRecord);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_revenue_shares SET status = $1, paid_at = $2, stripe_payout_id = $3 WHERE id = $4 RETURNING *');
      expect(params).toEqual(['paid', paidAt, 'po_123', 'rev_001']);
    });

    it('returns findById result when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVENUE_SHARE_RECORD] });
      const result = await repo.update('rev_001', {});
      expect(result).toEqual(REVENUE_SHARE_RECORD);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('returns null when row not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.update('nonexistent', { status: 'paid' });
      expect(result).toBeNull();
    });

    it('ignores unknown fields in data object', async () => {
      const updatedRecord = { ...REVENUE_SHARE_RECORD, status: 'paid' as RevenueShareStatus };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRecord] });
      // @ts-expect-error - testing runtime behavior with unknown field
      const result = await repo.update('rev_001', { status: 'paid', unknownField: 'value' });
      expect(result).toEqual(updatedRecord);
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).not.toContain('unknownField');
    });
  });

  // ─── markAsPaid ─────────────────────────────────────────────────────────────

  describe('markAsPaid', () => {
    it('marks record as paid with stripePayoutId', async () => {
      const paidRecord = { ...REVENUE_SHARE_RECORD, status: 'paid' as RevenueShareStatus, paidAt: new Date('2026-09-01T00:00:00Z'), stripePayoutId: 'po_123' };
      mockQuery.mockResolvedValueOnce({ rows: [paidRecord] });
      const result = await repo.markAsPaid('rev_001', 'po_123');
      expect(result).toEqual(paidRecord);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE marketplace_revenue_shares SET status = \'paid\', paid_at = NOW(), stripe_payout_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *');
      expect(params).toEqual(['po_123', 'rev_001']);
    });

    it('marks record as paid without stripePayoutId (null)', async () => {
      const paidRecord = { ...REVENUE_SHARE_RECORD, status: 'paid' as RevenueShareStatus, paidAt: new Date('2026-09-01T00:00:00Z'), stripePayoutId: undefined };
      mockQuery.mockResolvedValueOnce({ rows: [paidRecord] });
      const result = await repo.markAsPaid('rev_001');
      expect(result).toEqual(paidRecord);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(params).toEqual([null, 'rev_001']);
    });

    it('returns null when record not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.markAsPaid('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── findByPeriod ───────────────────────────────────────────────────────────

  describe('findByPeriod', () => {
    it('returns record when found for exact period', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [REVENUE_SHARE_RECORD] });
      const result = await repo.findByPeriod('strat-1', new Date('2026-08-01'), new Date('2026-08-31'));
      expect(result).toEqual(REVENUE_SHARE_RECORD);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1 AND period_start = $2 AND period_end = $3 LIMIT 1');
      expect(params).toEqual(['strat-1', new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-31T00:00:00.000Z')]);
    });

    it('returns null when no matching record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await repo.findByPeriod('strat-1', new Date('2026-09-01'), new Date('2026-09-30'));
      expect(result).toBeNull();
    });
  });

  // ─── getCreatorTotals ───────────────────────────────────────────────────────

  describe('getCreatorTotals', () => {
    it('returns aggregated totals for tenant', async () => {
      const totalsRow = { total_revenue: '50000', total_payouts: '30000', pending: '20000' };
      mockQuery.mockResolvedValueOnce({ rows: [totalsRow] });
      const result = await repo.getCreatorTotals('tenant_001');
      expect(result).toEqual({
        totalRevenue: 50000,
        totalPayouts: 30000,
        pending: 20000,
      });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('FROM marketplace_revenue_shares WHERE tenant_id = $1');
      expect(params).toEqual(['tenant_001']);
    });

    it('handles null sums (COALESCE returns 0 from DB)', async () => {
      // COALESCE in SQL means DB always returns a number/string, never null.
      // Simulate the COALESCE fallback returning 0 as a string (Postgres behavior).
      const totalsRow = { total_revenue: '0', total_payouts: '0', pending: '0' };
      mockQuery.mockResolvedValueOnce({ rows: [totalsRow] });
      const result = await repo.getCreatorTotals('tenant_001');
      expect(result).toEqual({
        totalRevenue: 0,
        totalPayouts: 0,
        pending: 0,
      });
    });

    it('handles string sums correctly', async () => {
      const totalsRow = { total_revenue: '100', total_payouts: '50', pending: '50' };
      mockQuery.mockResolvedValueOnce({ rows: [totalsRow] });
      const result = await repo.getCreatorTotals('tenant_001');
      expect(result).toEqual({
        totalRevenue: 100,
        totalPayouts: 50,
        pending: 50,
      });
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('returns true when row deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });
      const result = await repo.delete('rev_001');
      expect(result).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('DELETE FROM marketplace_revenue_shares WHERE id = $1');
      expect(params).toEqual(['rev_001']);
    });

    it('returns false when row not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      const result = await repo.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when rowCount undefined', async () => {
      mockQuery.mockResolvedValueOnce({});
      const result = await repo.delete('rev_001');
      expect(result).toBe(false);
    });
  });

  // ─── count ──────────────────────────────────────────────────────────────────

  describe('count', () => {
    it('returns total with no filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 42 }] });
      const result = await repo.count();
      expect(result).toBe(42);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([]);
    });

    it('applies strategyId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });
      const result = await repo.count({ strategyId: 's1' });
      expect(result).toBe(3);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1');
      expect(params).toEqual(['s1']);
    });

    it('applies tenantId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
      const result = await repo.count({ tenantId: 't1' });
      expect(result).toBe(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual(['t1']);
    });

    it('applies status filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await repo.count({ status: 'paid' });
      expect(result).toBe(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE status = $1');
      expect(params).toEqual(['paid']);
    });

    it('applies all three filters together', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await repo.count({ strategyId: 's1', tenantId: 't1', status: 'paid' });
      expect(result).toBe(1);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('WHERE strategy_id = $1 AND tenant_id = $2 AND status = $3');
      expect(params).toEqual(['s1', 't1', 'paid']);
    });

    it('parses string total from COUNT(*)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '7' }] });
      const result = await repo.count();
      expect(result).toBe(7);
    });
  });
});