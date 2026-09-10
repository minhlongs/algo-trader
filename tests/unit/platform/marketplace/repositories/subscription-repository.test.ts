/**
 * SubscriptionRepository Tests
 * Covers: findById, findByPaymentId, findAll (with filters/sort/pagination),
 * create (with/without optional fields), update (all fields, paused/cancelled),
 * delete, count (with/without filters), hasActiveSubscription,
 * findActiveByTenant, findActiveByStrategy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionRepository } from '../../../../../src/platform/marketplace/repositories/subscription-repository';

const mockQuery = vi.fn();

vi.mock('../../../../../src/shared/db/postgres-client', () => ({
  query: vi.fn((...args: unknown[]) => mockQuery(...args)),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_SUB = {
  id: 'sub-001',
  tenantId: 'tenant-1',
  listingId: 'list-001',
  strategyId: 'strat-001',
  status: 'active',
  allocationPercent: 10,
  customRiskLimits: null,
  currentInvestmentUsd: 100,
  paymentId: null,
  paymentStatus: null,
};

function makeResult(rows: unknown[] = [BASE_SUB], rowCount = 1) {
  return { rows, rowCount } as any;
}

function emptyResult() {
  return { rows: [], rowCount: 0 } as any;
}

function countResult(total: number) {
  return { rows: [{ total: String(total) }], rowCount: 1 } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SubscriptionRepository', () => {
  let repo: SubscriptionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new SubscriptionRepository();
  });

  describe('findById', () => {
    it('returns subscription when found', async () => {
      mockQuery.mockResolvedValueOnce(makeResult());
      const result = await repo.findById('sub-001');
      expect(result).toEqual(BASE_SUB);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        ['sub-001'],
      );
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce(emptyResult());
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByPaymentId', () => {
    it('returns subscription by payment ID', async () => {
      mockQuery.mockResolvedValueOnce(makeResult());
      const result = await repo.findByPaymentId('pay-123');
      expect(result).toEqual(BASE_SUB);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE payment_id = $1'),
        ['pay-123'],
      );
    });

    it('returns null when payment ID not found', async () => {
      mockQuery.mockResolvedValueOnce(emptyResult());
      const result = await repo.findByPaymentId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns paginated results with defaults', async () => {
      mockQuery.mockResolvedValueOnce(countResult(5));
      mockQuery.mockResolvedValueOnce(makeResult([BASE_SUB], 5));
      const result = await repo.findAll();
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('applies tenantId filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      mockQuery.mockResolvedValueOnce(makeResult());
      await repo.findAll({ tenantId: 't1' });
      expect(mockQuery.mock.calls[0]![0]).toContain('tenant_id = $1');
      expect(mockQuery.mock.calls[0]![1]).toContain('t1');
    });

    it('applies strategyId filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      mockQuery.mockResolvedValueOnce(makeResult());
      await repo.findAll({ strategyId: 's1' });
      expect(mockQuery.mock.calls[0]![0]).toContain('strategy_id = $1');
    });

    it('applies listingId filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      mockQuery.mockResolvedValueOnce(makeResult());
      await repo.findAll({ listingId: 'l1' });
      expect(mockQuery.mock.calls[0]![0]).toContain('listing_id = $1');
    });

    it('applies status filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      mockQuery.mockResolvedValueOnce(makeResult());
      await repo.findAll({ status: 'active' });
      expect(mockQuery.mock.calls[0]![0]).toContain('status = $1');
    });

    it('applies multiple filters', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      mockQuery.mockResolvedValueOnce(makeResult());
      await repo.findAll({ tenantId: 't1', status: 'paused' });
      expect(mockQuery.mock.calls[0]![0]).toContain('AND');
    });

    it('applies custom sort and pagination', async () => {
      mockQuery.mockResolvedValueOnce(countResult(10));
      mockQuery.mockResolvedValueOnce(makeResult());
      const result = await repo.findAll(
        {},
        { page: 2, limit: 5 },
        { field: 'updated_at', order: 'asc' },
      );
      expect(result.page).toBe(2);
      expect(result.limit).toBe(5);
      expect(result.totalPages).toBe(2);
      expect(mockQuery.mock.calls[1]![0]).toContain('ORDER BY updated_at asc');
    });

    it('uses defaults when sort/pagination omitted', async () => {
      mockQuery.mockResolvedValueOnce(countResult(0));
      mockQuery.mockResolvedValueOnce(emptyResult());
      await repo.findAll({}, {});
      expect(mockQuery.mock.calls[1]![0]).toContain('ORDER BY created_at desc');
    });
  });

  describe('create', () => {
    it('creates subscription with all fields', async () => {
      const data = {
        id: 'sub-new', tenantId: 't1', listingId: 'l1', strategyId: 's1',
        allocationPercent: 25, customRiskLimits: { maxLoss: 100 },
        currentInvestmentUsd: 500, paymentId: 'pay-1', paymentStatus: 'completed',
      };
      mockQuery.mockResolvedValueOnce(makeResult([{ ...data }]));
      const result = await repo.create(data);
      expect(result).toBeDefined();
      expect(mockQuery.mock.calls[0]![1]).toContain('sub-new');
      expect(mockQuery.mock.calls[0]![1]).toContain('active');
    });

    it('creates subscription with initialStatus override', async () => {
      const data = {
        id: 'sub-paused', tenantId: 't1', listingId: 'l1', strategyId: 's1',
        allocationPercent: 10, currentInvestmentUsd: 100,
        initialStatus: 'paused',
      };
      mockQuery.mockResolvedValueOnce(makeResult([{ ...data, status: 'paused' }]));
      await repo.create(data);
      expect(mockQuery.mock.calls[0]![1]).toContain('paused');
    });

    it('creates subscription with null optional fields', async () => {
      const data = {
        id: 'sub-min', tenantId: 't1', listingId: 'l1', strategyId: 's1',
        allocationPercent: 5, currentInvestmentUsd: 0,
      };
      mockQuery.mockResolvedValueOnce(makeResult([{ ...data }]));
      await repo.create(data);
      const params = mockQuery.mock.calls[0]![1] as unknown[];
      expect(params).toContain(null);
    });

    it('creates subscription with paymentId but no paymentStatus (defaults to pending)', async () => {
      const data = {
        id: 'sub-pay', tenantId: 't1', listingId: 'l1', strategyId: 's1',
        allocationPercent: 10, currentInvestmentUsd: 50, paymentId: 'pay-2',
      };
      mockQuery.mockResolvedValueOnce(makeResult([{ ...data }]));
      await repo.create(data);
      expect(mockQuery.mock.calls[0]![1]).toContain('pending');
    });
  });

  describe('update', () => {
    it('updates status field', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB, status: 'paused' }]));
      const result = await repo.update('sub-001', { status: 'paused' } as any);
      expect(result).toBeDefined();
      expect(mockQuery.mock.calls[0]![0]).toContain('SET status');
      expect(mockQuery.mock.calls[0]![0]).toContain('paused_at');
    });

    it('updates cancelled status adds cancelled_at', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB, status: 'cancelled' }]));
      await repo.update('sub-001', { status: 'cancelled' } as any);
      expect(mockQuery.mock.calls[0]![0]).toContain('cancelled_at');
    });

    it('updates allocationPercent', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB, allocationPercent: 20 }]));
      await repo.update('sub-001', { allocationPercent: 20 } as any);
      expect(mockQuery.mock.calls[0]![0]).toContain('allocation_percent');
    });

    it('updates customRiskLimits as JSON', async () => {
      const limits = { maxLoss: 200 };
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB, customRiskLimits: limits }]));
      await repo.update('sub-001', { customRiskLimits: limits } as any);
      expect(mockQuery.mock.calls[0]![1]).toContain(JSON.stringify(limits));
    });

    it('updates currentInvestmentUsd', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB, currentInvestmentUsd: 750 }]));
      await repo.update('sub-001', { currentInvestmentUsd: 750 } as any);
      expect(mockQuery.mock.calls[0]![0]).toContain('current_investment_usd');
    });

    it('updates totalPnlUsd', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB, totalPnlUsd: 50 }]));
      await repo.update('sub-001', { totalPnlUsd: 50 } as any);
      expect(mockQuery.mock.calls[0]![0]).toContain('total_pnl_usd');
    });

    it('updates paymentId and paymentStatus', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([{ ...BASE_SUB }]));
      await repo.update('sub-001', { paymentId: 'pay-3', paymentStatus: 'completed' } as any);
      expect(mockQuery.mock.calls[0]![0]).toContain('payment_id');
      expect(mockQuery.mock.calls[0]![0]).toContain('payment_status');
    });

    it('returns findById result when no fields to update', async () => {
      mockQuery.mockResolvedValueOnce(makeResult());
      const result = await repo.update('sub-001', {});
      expect(result).toEqual(BASE_SUB);
    });
  });

  describe('delete', () => {
    it('deletes and returns true when row exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await repo.delete('sub-001');
      expect(result).toBe(true);
    });

    it('returns false when no row deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await repo.delete('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when rowCount is undefined', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: undefined });
      const result = await repo.delete('sub-001');
      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('counts all with no filters', async () => {
      mockQuery.mockResolvedValueOnce(countResult(42));
      const result = await repo.count();
      expect(result).toBe(42);
    });

    it('counts with tenantId filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(5));
      await repo.count({ tenantId: 't1' });
      expect(mockQuery.mock.calls[0]![0]).toContain('tenant_id');
    });

    it('counts with strategyId filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(3));
      await repo.count({ strategyId: 's1' });
      expect(mockQuery.mock.calls[0]![0]).toContain('strategy_id');
    });

    it('counts with status filter', async () => {
      mockQuery.mockResolvedValueOnce(countResult(2));
      await repo.count({ status: 'active' });
      expect(mockQuery.mock.calls[0]![0]).toContain('status');
    });

    it('counts with all filters', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      await repo.count({ tenantId: 't1', strategyId: 's1', status: 'active' });
      expect(mockQuery.mock.calls[0]![0]).toContain('AND');
    });
  });

  describe('hasActiveSubscription', () => {
    it('returns true when active subscription exists', async () => {
      mockQuery.mockResolvedValueOnce(countResult(1));
      const result = await repo.hasActiveSubscription('t1', 's1');
      expect(result).toBe(true);
    });

    it('returns false when no active subscription', async () => {
      mockQuery.mockResolvedValueOnce(countResult(0));
      const result = await repo.hasActiveSubscription('t1', 's1');
      expect(result).toBe(false);
    });
  });

  describe('findActiveByTenant', () => {
    it('returns active subscriptions for tenant', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([BASE_SUB]));
      const result = await repo.findActiveByTenant('t1');
      expect(result).toEqual([BASE_SUB]);
      expect(mockQuery.mock.calls[0]![1]).toContain('t1');
    });

    it('returns empty array when none found', async () => {
      mockQuery.mockResolvedValueOnce(emptyResult());
      const result = await repo.findActiveByTenant('t1');
      expect(result).toEqual([]);
    });
  });

  describe('findActiveByStrategy', () => {
    it('returns active subscriptions for strategy', async () => {
      mockQuery.mockResolvedValueOnce(makeResult([BASE_SUB]));
      const result = await repo.findActiveByStrategy('s1');
      expect(result).toEqual([BASE_SUB]);
      expect(mockQuery.mock.calls[0]![1]).toContain('s1');
    });

    it('returns empty array when none found', async () => {
      mockQuery.mockResolvedValueOnce(emptyResult());
      const result = await repo.findActiveByStrategy('s1');
      expect(result).toEqual([]);
    });
  });
});
