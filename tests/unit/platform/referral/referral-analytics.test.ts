/**
 * Tests for referral-analytics — click queries, stats aggregation,
 * commission listing and pending payout grouping.
 *
 * query (postgres-client) is mocked with an in-memory SQL-shape fake;
 * referral-crud helpers are mocked so suites stay hermetic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReferralCode, ReferralClick } from '../../../../src/platform/referral/types';

const { mockQuery, mockGetReferralCodeByTenant, mockMapReferralClick } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockGetReferralCodeByTenant: vi.fn(),
  mockMapReferralClick: vi.fn(),
}));

vi.mock('../../../../src/shared/db/postgres-client', () => ({
  query: mockQuery,
  transaction: vi.fn(),
  getDbClient: vi.fn(),
  closeDbConnection: vi.fn(),
}));

vi.mock('../../../../src/platform/referral/referral-crud', () => ({
  getReferralCodeByTenant: mockGetReferralCodeByTenant,
  mapReferralClick: vi.fn((row: { id: string; referral_code: string }) => ({
    id: row.id,
    code: row.referral_code,
  } as unknown as ReferralClick)),
}));

import {
  getClicksByCode,
  getTrackingByTenant,
  getReferralStats,
  getCommissions,
  getPendingCommissions,
} from '../../../../src/platform/referral/referral-analytics';

function makeCodeRow(): ReferralCode {
  return {
    code: 'ABC-DEFGH',
    tenantId: 'tenant-1',
    createdAt: new Date('2026-01-01'),
    isActive: true,
    maxUses: null,
    usedCount: 3,
  };
}

describe('getClicksByCode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by code with limit/offset and maps rows', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'c1', referral_code: 'ABC-DEFGH' },
        { id: 'c2', referral_code: 'ABC-DEFGH' },
      ],
    });
    const clicks = await getClicksByCode('ABC-DEFGH', 10, 5);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM referral_tracking');
    expect(sql).toContain('WHERE referral_code = $1');
    expect(params).toEqual(['ABC-DEFGH', 10, 5]);
    expect(clicks).toHaveLength(2);
  });
});

describe('getTrackingByTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('joins referral_codes to filter by tenant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'c1', referral_code: 'ABC-DEFGH' }] });
    const clicks = await getTrackingByTenant('tenant-1', 5, 0);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN referral_codes c ON t.referral_code = c.code');
    expect(sql).toContain('WHERE c.tenant_id = $1');
    expect(params).toEqual(['tenant-1', 5, 0]);
    expect(clicks).toHaveLength(1);
  });
});

describe('getReferralStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReferralCodeByTenant.mockResolvedValue(makeCodeRow());
  });

  it('returns null when the tenant has no referral code', async () => {
    mockGetReferralCodeByTenant.mockResolvedValue(null);
    expect(await getReferralStats('tenant-1')).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('aggregates clicks, revenue, commissions and top referrers', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_clicks: 10, unique_clicks: 4, conversions: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total_revenue: 500, total_commissions: 50 }] })
      .mockResolvedValueOnce({ rows: [{ pending_commissions: 20 }] })
      .mockResolvedValueOnce({ rows: [{ paid_commissions: 30 }] })
      .mockResolvedValueOnce({ rows: [{ tenant_id: 'conv-1', conversions: 2, commission_earned: 50 }] });

    const stats = await getReferralStats('tenant-1');
    expect(stats).not.toBeNull();
    expect(stats!.totalClicks).toBe(10);
    expect(stats!.uniqueClicks).toBe(4);
    expect(stats!.conversions).toBe(2);
    expect(stats!.conversionRate).toBe(20);
    expect(stats!.totalRevenue).toBe(500);
    expect(stats!.totalCommissions).toBe(50);
    expect(stats!.pendingCommissions).toBe(20);
    expect(stats!.paidCommissions).toBe(30);
    expect(stats!.topReferrers).toEqual([
      { tenantId: 'conv-1', conversions: 2, commissionEarned: 50 },
    ]);
    // every aggregate query is scoped to the tenant's code
    for (const call of mockQuery.mock.calls) {
      expect((call[1] as unknown[])[0]).toBe('ABC-DEFGH');
    }
  });

  it('computes conversionRate 0 when there are no clicks', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_clicks: 0, unique_clicks: 0, conversions: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total_revenue: 0, total_commissions: 0 }] })
      .mockResolvedValueOnce({ rows: [{ pending_commissions: 0 }] })
      .mockResolvedValueOnce({ rows: [{ paid_commissions: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const stats = await getReferralStats('tenant-1');
    expect(stats!.conversionRate).toBe(0);
    expect(stats!.topReferrers).toEqual([]);
  });

  it('period spans the current calendar month', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_clicks: 1, unique_clicks: 1, conversions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ total_revenue: 1, total_commissions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ pending_commissions: 1 }] })
      .mockResolvedValueOnce({ rows: [{ paid_commissions: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const stats = await getReferralStats('tenant-1');
    const now = new Date();
    expect(stats!.period.start).toBe(
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    );
    expect(stats!.period.end).toBe(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
    );
  });
});

describe('getCommissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists commissions without a status filter', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'rc1', tenant_id: 'tenant-1', tracking_id: 't1',
            commission_amount: 12.5, fee_percentage: 10,
            period_start: new Date('2026-01-01'), period_end: new Date('2026-01-31'),
            status: 'pending', paid_at: null, stripe_payout_id: null,
            created_at: new Date('2026-02-01'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: '3' }] });

    const result = await getCommissions('tenant-1', undefined, 20, 0);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('AND rc.status');
    expect(params).toEqual(['tenant-1', 20, 0]);
    expect(result.total).toBe(3);
    expect(result.commissions[0]).toEqual({
      id: 'rc1',
      tenantId: 'tenant-1',
      trackingId: 't1',
      commissionAmount: 12.5,
      feePercentage: 10,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      status: 'pending',
      paidAt: null,
      stripePayoutId: null,
      createdAt: new Date('2026-02-01'),
    });
  });

  it('filters by status when provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] });

    const result = await getCommissions('tenant-1', 'paid', 50, 10);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('AND rc.status = $2');
    expect(params).toEqual(['tenant-1', 'paid', 50, 10]);
    const [countSql, countParams] = mockQuery.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain('AND status = $2');
    expect(countParams).toEqual(['tenant-1', 'paid']);
    expect(result.commissions).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('getPendingCommissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups pending commissions per tenant above the threshold', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { tenant_id: 'tenant-1', total_amount: '25.5', commission_ids: ['a', 'b'] },
        { tenant_id: 'tenant-2', total_amount: '80', commission_ids: ['c'] },
      ],
    });

    const pending = await getPendingCommissions(new Date('2026-01-01'), new Date('2026-01-31'), 10);
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("WHERE rc.status = 'pending'");
    expect(sql).toContain('HAVING SUM(rc.commission_amount) >= $3');
    expect(params).toEqual([new Date('2026-01-01'), new Date('2026-01-31'), 10]);
    expect(pending).toEqual([
      { tenantId: 'tenant-1', amount: 25.5, commissions: ['a', 'b'] },
      { tenantId: 'tenant-2', amount: 80, commissions: ['c'] },
    ]);
  });
});
