/**
 * Tests for RevenueService — mocked RevenueShareRepository and SubscriptionRepository
 * so all methods are exercised without a live database. Verifies logic, error handling,
 * and repository interactions.
 * Target: 100% coverage for src/platform/marketplace/services/revenue.service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRevenueRepo, mockLogger } = vi.hoisted(() => ({
  mockRevenueRepo: {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    markAsPaid: vi.fn(),
    findByPeriod: vi.fn(),
    getCreatorTotals: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../../src/shared/utils/logger', () => ({ logger: mockLogger }));

vi.mock('../../../../src/platform/marketplace/repositories/revenue-share-repository', () => ({
  RevenueShareRepository: vi.fn().mockImplementation(() => mockRevenueRepo),
  revenueShareRepository: mockRevenueRepo,
}));

const { mockSubscriptionRepo } = vi.hoisted(() => ({
  mockSubscriptionRepo: {
    findById: vi.fn(),
  },
}));

vi.mock('../../../../src/platform/marketplace/repositories/subscription-repository', () => ({
  SubscriptionRepository: vi.fn().mockImplementation(() => mockSubscriptionRepo),
  subscriptionRepository: mockSubscriptionRepo,
}));

import { RevenueService } from '../../../../src/platform/marketplace/services/revenue.service';
import type { IMarketplaceRevenueShare, IMarketplaceSubscription, RevenueShareStatus } from '../../../../src/platform/marketplace/models/types';

const PLATFORM_FEE_PERCENT = 0.2;
const CREATOR_SHARE_PERCENT = 0.8;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const REVENUE_RECORD: IMarketplaceRevenueShare = {
  id: 'rev_001',
  strategyId: 'strat_001',
  tenantId: 'tenant_001',
  subscriptionId: 'sub_001',
  periodStart: new Date('2026-08-01T00:00:00Z'),
  periodEnd: new Date('2026-08-31T23:59:59Z'),
  grossRevenueCents: 10000,
  platformShareCents: 2000,
  creatorShareCents: 8000,
  status: 'pending' as RevenueShareStatus,
  paidAt: undefined,
  stripePayoutId: undefined,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

const SUBSCRIPTION: IMarketplaceSubscription = {
  id: 'sub_001',
  tenantId: 'tenant_001',
  listingId: 'listing_001',
  strategyId: 'strat_001',
  status: 'active',
  allocationPercent: 100,
  currentInvestmentUsd: 100000,
  totalPnlUsd: 5000,
  subscriptionStartedAt: new Date('2026-08-01T00:00:00Z'),
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

// ─── Suite ──────────────────────────────────────────────────────────────────────

describe('RevenueService', () => {
  let service: RevenueService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear singleton to get fresh instance
    (RevenueService as unknown as { instance?: RevenueService }).instance = undefined;
    service = new RevenueService();
  });

  // ─── Singleton ────────────────────────────────────────────────────────────────

  describe('singleton', () => {
    it('exposes a module-level singleton instance via getInstance', () => {
      const instance1 = RevenueService.getInstance();
      const instance2 = RevenueService.getInstance();
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(RevenueService);
    });

    it('returns same instance when calling getInstance multiple times', () => {
      const instance1 = RevenueService.getInstance();
      const instance2 = RevenueService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  // ─── getRevenueOverview ──────────────────────────────────────────────────────

  describe('getRevenueOverview', () => {
    it('returns aggregated totals with paid and pending breakdown', async () => {
      const records = [
        { ...REVENUE_RECORD, grossRevenueCents: 10000, platformShareCents: 2000, creatorShareCents: 8000, status: 'paid' as RevenueShareStatus },
        { ...REVENUE_RECORD, id: 'rev_002', grossRevenueCents: 5000, platformShareCents: 1000, creatorShareCents: 4000, status: 'pending' as RevenueShareStatus },
        { ...REVENUE_RECORD, id: 'rev_003', grossRevenueCents: 3000, platformShareCents: 600, creatorShareCents: 2400, status: 'void' as RevenueShareStatus },
      ];
      mockRevenueRepo.findAll.mockResolvedValue({ data: records, total: 3, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getRevenueOverview();

      expect(result.totalRevenue).toBe(18000); // 10000 + 5000 + 3000
      expect(result.totalPayouts).toBe(8000); // only paid: 8000
      expect(result.pending).toBe(4000); // only pending: 4000
      expect(result.period).toBeUndefined();
    });

    it('applies period filters when provided', async () => {
      mockRevenueRepo.findAll.mockResolvedValue({ data: [REVENUE_RECORD], total: 1, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getRevenueOverview({ periodStart: '2026-08-01', periodEnd: '2026-08-31' });

      expect(result.totalRevenue).toBe(10000);
      expect(result.period).toEqual({ start: '2026-08-01', end: '2026-08-31' });
      expect(mockRevenueRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          periodStart: expect.any(Date),
        })
      );
    });

    it('handles empty data gracefully', async () => {
      mockRevenueRepo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      const result = await service.getRevenueOverview();

      expect(result).toEqual({
        totalRevenue: 0,
        totalPayouts: 0,
        pending: 0,
        period: undefined,
      });
    });

    it('correctly sums only paid records for totalPayouts', async () => {
      const records = [
        { ...REVENUE_RECORD, status: 'paid' as RevenueShareStatus, creatorShareCents: 5000 },
        { ...REVENUE_RECORD, id: 'rev_002', status: 'paid' as RevenueShareStatus, creatorShareCents: 3000 },
        { ...REVENUE_RECORD, id: 'rev_003', status: 'pending' as RevenueShareStatus, creatorShareCents: 2000 },
      ];
      mockRevenueRepo.findAll.mockResolvedValue({ data: records, total: 3, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getRevenueOverview();

      expect(result.totalPayouts).toBe(8000); // 5000 + 3000
      expect(result.pending).toBe(2000);
    });

    it('correctly sums only pending records for pending', async () => {
      const records = [
        { ...REVENUE_RECORD, status: 'paid' as RevenueShareStatus, creatorShareCents: 5000 },
        { ...REVENUE_RECORD, id: 'rev_002', status: 'pending' as RevenueShareStatus, creatorShareCents: 3000 },
        { ...REVENUE_RECORD, id: 'rev_003', status: 'pending' as RevenueShareStatus, creatorShareCents: 2000 },
        { ...REVENUE_RECORD, id: 'rev_004', status: 'void' as RevenueShareStatus, creatorShareCents: 1000 },
      ];
      mockRevenueRepo.findAll.mockResolvedValue({ data: records, total: 4, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getRevenueOverview();

      expect(result.pending).toBe(5000); // 3000 + 2000
    });
  });

  // ─── getAllCreatorPayouts ────────────────────────────────────────────────────

  describe('getAllCreatorPayouts', () => {
    it('returns all revenue records from repository', async () => {
      const records = [REVENUE_RECORD, { ...REVENUE_RECORD, id: 'rev_002' }];
      mockRevenueRepo.findAll.mockResolvedValue({ data: records, total: 2, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getAllCreatorPayouts();

      expect(result).toEqual(records);
      expect(mockRevenueRepo.findAll).toHaveBeenCalledWith();
    });

    it('returns empty array when no records', async () => {
      mockRevenueRepo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      const result = await service.getAllCreatorPayouts();

      expect(result).toEqual([]);
    });
  });

  // ─── calculateCreatorPayout ──────────────────────────────────────────────────

  describe('calculateCreatorPayout', () => {
    it('calculates correct split for positive amount', async () => {
      const amount = 10000; // 100 USD in cents
      const result = await service.calculateCreatorPayout('sub_001', amount);

      const expectedPlatform = Math.round(amount * PLATFORM_FEE_PERCENT); // 2000
      const expectedCreator = amount - expectedPlatform; // 8000

      expect(result).toEqual({
        subscriptionId: 'sub_001',
        grossRevenueCents: amount,
        platformShareCents: expectedPlatform,
        creatorShareCents: expectedCreator,
        platformFeePercent: PLATFORM_FEE_PERCENT,
        creatorSharePercent: CREATOR_SHARE_PERCENT,
      });
    });

    it('throws when amount is zero', async () => {
      await expect(service.calculateCreatorPayout('sub_001', 0)).rejects.toThrow('Amount must be a positive number');
    });

    it('throws when amount is negative', async () => {
      await expect(service.calculateCreatorPayout('sub_001', -100)).rejects.toThrow('Amount must be a positive number');
    });

    it('logs the calculation', async () => {
      await service.calculateCreatorPayout('sub_001', 10000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[RevenueService] Calculated payout',
        expect.objectContaining({
          subscriptionId: 'sub_001',
          grossRevenueCents: 10000,
          platformShareCents: 2000,
          creatorShareCents: 8000,
        })
      );
    });

    it('handles large amounts correctly', async () => {
      const amount = 1000000; // 10,000 USD in cents
      const result = await service.calculateCreatorPayout('sub_001', amount);

      expect(result.platformShareCents).toBe(200000);
      expect(result.creatorShareCents).toBe(800000);
    });

    it('handles rounding correctly for non-integer splits', async () => {
      const amount = 10001; // rounds to 2000 platform, 8001 creator
      const result = await service.calculateCreatorPayout('sub_001', amount);

      expect(result.platformShareCents).toBe(2000); // Math.round(10001 * 0.2) = 2000
      expect(result.creatorShareCents).toBe(8001);
      expect(result.platformShareCents + result.creatorShareCents).toBe(amount);
    });
  });

  // ─── requestPayout ───────────────────────────────────────────────────────────

  describe('requestPayout', () => {
    it('throws when amount is zero', async () => {
      await expect(service.requestPayout('creator_001', 0, { subscriptionId: 'sub_001' })).rejects.toThrow('Payout amount must be a positive number');
    });

    it('throws when amount is negative', async () => {
      await expect(service.requestPayout('creator_001', -100, { subscriptionId: 'sub_001' })).rejects.toThrow('Payout amount must be a positive number');
    });

    it('throws when subscriptionId is missing', async () => {
      await expect(service.requestPayout('creator_001', 10000, {})).rejects.toThrow('subscriptionId is required to request a payout');
    });

    it('looks up subscription when strategyId not provided', async () => {
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);

      const result = await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      expect(mockSubscriptionRepo.findById).toHaveBeenCalledWith('sub_001');
      expect(result).toEqual(REVENUE_RECORD);
    });

    it('throws when subscription not found', async () => {
      mockSubscriptionRepo.findById.mockResolvedValue(null);

      await expect(service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_missing' })).rejects.toThrow('Subscription not found: sub_missing');
    });

    it('uses provided strategyId and tenantId when available', async () => {
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);

      const result = await service.requestPayout('creator_001', 10000, {
        subscriptionId: 'sub_001',
        strategyId: 'strat_custom',
      });

      expect(mockSubscriptionRepo.findById).not.toHaveBeenCalled();
      expect(mockRevenueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          strategyId: 'strat_custom',
          tenantId: 'creator_001',
        })
      );
      expect(result).toEqual(REVENUE_RECORD);
    });

    it('uses provided periodStart and periodEnd', async () => {
      const periodStart = new Date('2026-07-01');
      const periodEnd = new Date('2026-07-31');
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      await service.requestPayout('creator_001', 10000, {
        subscriptionId: 'sub_001',
        periodStart,
        periodEnd,
      });

      expect(mockRevenueRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          periodStart,
          periodEnd,
        })
      );
    });

    it('uses current time as default for periodStart and periodEnd', async () => {
      const before = new Date();
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      const after = new Date();
      const createCall = mockRevenueRepo.create.mock.calls[0][0];
      expect(createCall.periodStart.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createCall.periodStart.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(createCall.periodEnd.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(createCall.periodEnd.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('generates unique id with timestamp and creatorId prefix', async () => {
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      const createCall = mockRevenueRepo.create.mock.calls[0][0];
      expect(createCall.id).toMatch(/^rev_\d+_creator/);
    });

    it('sets correct split amounts', async () => {
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      const createCall = mockRevenueRepo.create.mock.calls[0][0];
      expect(createCall.grossRevenueCents).toBe(10000);
      expect(createCall.platformShareCents).toBe(2000);
      expect(createCall.creatorShareCents).toBe(8000);
    });

    it('sets status to pending', async () => {
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      const createCall = mockRevenueRepo.create.mock.calls[0][0];
      expect(createCall.status).toBe('pending');
    });

    it('logs the payout request', async () => {
      mockRevenueRepo.create.mockResolvedValue(REVENUE_RECORD);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[RevenueService] Payout requested',
        expect.objectContaining({
          id: expect.stringMatching(/^rev_\d+_creator/),
          creatorId: 'creator_001',
          subscriptionId: 'sub_001',
          grossRevenueCents: 10000,
          creatorShareCents: 8000,
        })
      );
    });

    it('returns the created record from repository', async () => {
      const createdRecord = { ...REVENUE_RECORD, id: 'rev_new' };
      mockRevenueRepo.create.mockResolvedValue(createdRecord);
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      const result = await service.requestPayout('creator_001', 10000, { subscriptionId: 'sub_001' });

      expect(result).toEqual(createdRecord);
    });
  });

  // ─── getRevenueReport ────────────────────────────────────────────────────────

  describe('getRevenueReport', () => {
    const period = { start: new Date('2026-08-01'), end: new Date('2026-08-31') };

    it('returns full revenue report with all aggregations', async () => {
      const records = [
        { ...REVENUE_RECORD, grossRevenueCents: 10000, platformShareCents: 2000, creatorShareCents: 8000, status: 'paid' as RevenueShareStatus },
        { ...REVENUE_RECORD, id: 'rev_002', grossRevenueCents: 5000, platformShareCents: 1000, creatorShareCents: 4000, status: 'pending' as RevenueShareStatus },
        { ...REVENUE_RECORD, id: 'rev_003', grossRevenueCents: 3000, platformShareCents: 600, creatorShareCents: 2400, status: 'void' as RevenueShareStatus },
      ];
      mockRevenueRepo.findAll.mockResolvedValue({ data: records, total: 3, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getRevenueReport('tenant_001', period);

      expect(result.tenantId).toBe('tenant_001');
      expect(result.period).toEqual(period);
      expect(result.totalGrossRevenueCents).toBe(18000);
      expect(result.totalPlatformShareCents).toBe(3600);
      expect(result.totalCreatorShareCents).toBe(14400);
      expect(result.paidCents).toBe(8000);
      expect(result.pendingCents).toBe(4000);
      expect(result.voidCents).toBe(2400);
      expect(result.transactionCount).toBe(3);
      expect(result.records).toEqual(records);
    });

    it('applies correct filters to findAll', async () => {
      mockRevenueRepo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await service.getRevenueReport('tenant_001', period);

      expect(mockRevenueRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_001',
          periodStart: period.start,
          periodEnd: period.end,
        })
      );
    });

    it('handles empty records', async () => {
      mockRevenueRepo.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      const result = await service.getRevenueReport('tenant_001', period);

      expect(result).toEqual({
        tenantId: 'tenant_001',
        period,
        totalGrossRevenueCents: 0,
        totalPlatformShareCents: 0,
        totalCreatorShareCents: 0,
        paidCents: 0,
        pendingCents: 0,
        voidCents: 0,
        transactionCount: 0,
        records: [],
      });
    });

    it('logs the report generation', async () => {
      mockRevenueRepo.findAll.mockResolvedValue({ data: [REVENUE_RECORD], total: 1, page: 1, limit: 20, totalPages: 1 });

      await service.getRevenueReport('tenant_001', period);

      expect(mockLogger.info).toHaveBeenCalledWith(
        '[RevenueService] Revenue report generated',
        expect.objectContaining({
          tenantId: 'tenant_001',
          periodStart: period.start,
          periodEnd: period.end,
          totalGrossRevenueCents: 10000,
          totalCreatorShareCents: 8000,
          transactionCount: 1,
        })
      );
    });

    it('correctly filters paid/pending/void by status', async () => {
      const records = [
        { ...REVENUE_RECORD, status: 'paid' as RevenueShareStatus, creatorShareCents: 5000 },
        { ...REVENUE_RECORD, id: 'rev_002', status: 'pending' as RevenueShareStatus, creatorShareCents: 3000 },
        { ...REVENUE_RECORD, id: 'rev_003', status: 'pending' as RevenueShareStatus, creatorShareCents: 2000 },
        { ...REVENUE_RECORD, id: 'rev_004', status: 'void' as RevenueShareStatus, creatorShareCents: 1000 },
        { ...REVENUE_RECORD, id: 'rev_005', status: 'paid' as RevenueShareStatus, creatorShareCents: 4000 },
      ];
      mockRevenueRepo.findAll.mockResolvedValue({ data: records, total: 5, page: 1, limit: 20, totalPages: 1 });

      const result = await service.getRevenueReport('tenant_001', period);

      expect(result.paidCents).toBe(9000); // 5000 + 4000
      expect(result.pendingCents).toBe(5000); // 3000 + 2000
      expect(result.voidCents).toBe(1000);
    });
  });

  // ─── lookupSubscription (private) ───────────────────────────────────────────

  describe('lookupSubscription (private)', () => {
    it('returns subscription when found', async () => {
      mockSubscriptionRepo.findById.mockResolvedValue(SUBSCRIPTION);

      // Access private method via bracket notation
      const result = await (service as unknown as { lookupSubscription: (id: string) => Promise<IMarketplaceSubscription | null> }).lookupSubscription('sub_001');

      expect(result).toEqual(SUBSCRIPTION);
      expect(mockSubscriptionRepo.findById).toHaveBeenCalledWith('sub_001');
    });

    it('returns null when not found', async () => {
      mockSubscriptionRepo.findById.mockResolvedValue(null);

      const result = await (service as unknown as { lookupSubscription: (id: string) => Promise<IMarketplaceSubscription | null> }).lookupSubscription('sub_missing');

      expect(result).toBeNull();
    });
  });
});