/**
 * Revenue Share Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RevenueShareRepository } from '../repositories/revenue-share-repository';
import type { IMarketplaceRevenueShare } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../../shared/db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('RevenueShareRepository', () => {
  let repo: RevenueShareRepository;

  beforeEach(() => {
    repo = new RevenueShareRepository();
    mockQuery.mockClear();
  });

  const mockRevenue: IMarketplaceRevenueShare = {
    id: 'rev_001',
    strategyId: 'strat_001',
    tenantId: 'tenant_001',
    subscriptionId: 'sub_001',
    periodStart: new Date('2024-01-01'),
    periodEnd: new Date('2024-01-31'),
    grossRevenueCents: 10000,
    platformShareCents: 3000,
    creatorShareCents: 7000,
    status: 'pending',
    paidAt: null,
    stripePayoutId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should find revenue share by id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockRevenue] });
    const result = await repo.findById('rev_001');
    expect(result).toEqual(mockRevenue);
  });

  it('should create revenue share record', async () => {
    mockQuery.mockResolvedValue({ rows: [mockRevenue] });
    const result = await repo.create({
      id: 'rev_001',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      subscriptionId: 'sub_001',
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31'),
      grossRevenueCents: 10000,
      platformShareCents: 3000,
      creatorShareCents: 7000,
    });
    expect(result.status).toBe('pending');
  });

  it('should mark as paid', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockRevenue, status: 'paid', stripePayoutId: 'po_123' }] });
    const result = await repo.markAsPaid('rev_001', 'po_123');
    expect(result?.status).toBe('paid');
    expect(result?.stripePayoutId).toBe('po_123');
  });

  it('should get creator totals', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total_revenue: '10000', total_payouts: '7000', pending: '3000' }] });
    const result = await repo.getCreatorTotals('tenant_001');
    expect(result.totalRevenue).toBe(10000);
    expect(result.totalPayouts).toBe(7000);
    expect(result.pending).toBe(3000);
  });

  it('should find by period', async () => {
    mockQuery.mockResolvedValue({ rows: [mockRevenue] });
    const result = await repo.findByPeriod('strat_001', new Date('2024-01-01'), new Date('2024-01-31'));
    expect(result?.grossRevenueCents).toBe(10000);
  });

  it('should delete revenue share', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete('rev_001');
    expect(result).toBe(true);
  });
});
