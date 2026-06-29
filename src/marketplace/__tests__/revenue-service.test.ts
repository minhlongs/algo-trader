/**
 * Revenue Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RevenueService } from '../services/revenue.service';

const { mockRevenueRepo } = vi.hoisted(() => {
  const mockRevenueRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    markAsPaid: vi.fn(),
    findByPeriod: vi.fn(),
    getCreatorTotals: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
  return { mockRevenueRepo };
});

vi.mock('../repositories/revenue-share-repository', () => ({
  RevenueShareRepository: vi.fn().mockImplementation(() => mockRevenueRepo),
  revenueShareRepository: mockRevenueRepo,
}));

describe('RevenueService', () => {
  let service: RevenueService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RevenueService();
  });

  const mockRevenueRecords = [
    {
      id: 'rev_001',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      subscriptionId: 'sub_001',
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31'),
      grossRevenueCents: 10000,
      platformShareCents: 3000,
      creatorShareCents: 7000,
      status: 'paid',
      paidAt: new Date('2024-02-01'),
      stripePayoutId: 'po_123',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-02-01'),
    },
    {
      id: 'rev_002',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      subscriptionId: 'sub_002',
      periodStart: new Date('2024-02-01'),
      periodEnd: new Date('2024-02-29'),
      grossRevenueCents: 8000,
      platformShareCents: 2400,
      creatorShareCents: 5600,
      status: 'pending',
      paidAt: null,
      stripePayoutId: null,
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-02-01'),
    },
  ];

  it('should get revenue overview', async () => {
    mockRevenueRepo.findAll.mockResolvedValue({ data: mockRevenueRecords, total: 2, page: 1, limit: 20, totalPages: 1 });
    const result = await service.getRevenueOverview();
    expect(result.totalRevenue).toBe(18000);
    expect(result.totalPayouts).toBe(7000);
    expect(result.pending).toBe(5600);
  });

  it('should get revenue overview with filters', async () => {
    mockRevenueRepo.findAll.mockResolvedValue({ data: [mockRevenueRecords[0]], total: 1, page: 1, limit: 20, totalPages: 1 });
    const result = await service.getRevenueOverview({ periodStart: '2024-01-01', periodEnd: '2024-01-31' });
    expect(result.totalRevenue).toBe(10000);
    expect(result.period?.start).toBe('2024-01-01');
  });

  it('should get all creator payouts', async () => {
    mockRevenueRepo.findAll.mockResolvedValue({ data: mockRevenueRecords, total: 2, page: 1, limit: 20, totalPages: 1 });
    const result = await service.getAllCreatorPayouts();
    expect(result).toHaveLength(2);
  });

  it('should handle empty revenue data', async () => {
    mockRevenueRepo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await service.getRevenueOverview();
    expect(result.totalRevenue).toBe(0);
    expect(result.totalPayouts).toBe(0);
    expect(result.pending).toBe(0);
  });
});
