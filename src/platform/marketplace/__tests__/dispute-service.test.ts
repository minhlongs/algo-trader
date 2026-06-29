/**
 * Dispute Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DisputeService } from '../services/dispute.service';

const { mockDisputeRepo, mockSubRepo: mockDispSubRepo } = vi.hoisted(() => {
  const mockDisputeRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  };
  const mockSubRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    hasActiveSubscription: vi.fn(),
    findActiveByTenant: vi.fn(),
  };
  return { mockDisputeRepo, mockSubRepo };
});

vi.mock('../repositories/dispute-repository', () => ({
  DisputeRepository: vi.fn().mockImplementation(() => mockDisputeRepo),
  disputeRepository: mockDisputeRepo,
}));

vi.mock('../repositories/subscription-repository', () => ({
  SubscriptionRepository: vi.fn().mockImplementation(() => mockDispSubRepo),
  subscriptionRepository: mockDispSubRepo,
}));

describe('DisputeService', () => {
  let service: DisputeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DisputeService();
  });

  const mockDispSubscription = {
    id: 'sub_001',
    tenantId: 'tenant_001',
    listingId: 'listing_001',
    strategyId: 'strat_001',
    status: 'active',
    allocationPercent: 25,
    customRiskLimits: {},
    currentInvestmentUsd: 10000,
    totalPnlUsd: 500,
    subscriptionStartedAt: new Date('2024-01-01'),
    pausedAt: null,
    cancelledAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockDispute = {
    id: 'dispute_001',
    tenantId: 'tenant_001',
    listingId: 'listing_001',
    subscriptionId: 'sub_001',
    reason: 'performance_not_as_described',
    description: 'Strategy underperforms',
    evidenceUrls: [],
    status: 'open',
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    compensationAmountCents: null,
    compensationType: null,
    adminNotes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should file a dispute', async () => {
    mockDispSubRepo.findById.mockResolvedValue(mockDispSubscription);
    mockDisputeRepo.create.mockResolvedValue(mockDispute);
    const result = await service.fileDispute({
      tenantId: 'tenant_001',
      listingId: 'listing_001',
      subscriptionId: 'sub_001',
      reason: 'performance_not_as_described',
      description: 'Strategy underperforms significantly',
    });
    expect(result.id).toBe('dispute_001');
    expect(result.status).toBe('open');
  });

  it('should get dispute by id', async () => {
    mockDisputeRepo.findById.mockResolvedValue(mockDispute);
    const result = await service.getDispute('dispute_001');
    expect(result).toEqual(mockDispute);
  });

  it('should list disputes for tenant', async () => {
    mockDisputeRepo.findAll.mockResolvedValue({
      data: [mockDispute],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    const result = await service.listDisputes('tenant_001');
    expect(result.data).toHaveLength(1);
  });

  it('should list all disputes (admin)', async () => {
    mockDisputeRepo.findAll.mockResolvedValue({
      data: [mockDispute],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    const result = await service.listAllDisputes({});
    expect(result.data).toHaveLength(1);
  });

  it('should resolve a dispute', async () => {
    mockDisputeRepo.findById.mockResolvedValue(mockDispute);
    mockDisputeRepo.update.mockResolvedValue({ ...mockDispute, status: 'resolved_subscriber', resolution: 'Full refund granted' });
    const result = await service.resolveDispute('dispute_001', {
      resolution: 'Full refund granted',
      compensationType: 'full_refund',
      resolvedBy: 'admin_001',
    });
    expect(result?.status).toBe('resolved_subscriber');
  });

  it('should escalate a dispute', async () => {
    mockDisputeRepo.findById.mockResolvedValue(mockDispute);
    mockDisputeRepo.update.mockResolvedValue({ ...mockDispute, status: 'escalated' });
    const result = await service.escalateDispute('dispute_001', 'admin_001');
    expect(result?.status).toBe('escalated');
  });

  it('should get subscription for dispute', async () => {
    mockDispSubRepo.findById.mockResolvedValue(mockDispSubscription);
    const result = await service.getSubscriptionForDispute('sub_001');
    expect(result).toEqual(mockDispSubscription);
  });
});
