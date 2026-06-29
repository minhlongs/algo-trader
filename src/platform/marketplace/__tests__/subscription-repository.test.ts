/**
 * Subscription Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SubscriptionRepository } from '../repositories/subscription-repository';
import type { IMarketplaceSubscription } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../../shared/db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('SubscriptionRepository', () => {
  let repo: SubscriptionRepository;

  beforeEach(() => {
    repo = new SubscriptionRepository();
    mockQuery.mockClear();
  });

  const mockSubscription: IMarketplaceSubscription = {
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

  it('should find subscription by id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockSubscription] });
    const result = await repo.findById('sub_001');
    expect(result).toEqual(mockSubscription);
  });

  it('should create a subscription', async () => {
    mockQuery.mockResolvedValue({ rows: [mockSubscription] });
    const result = await repo.create({
      id: 'sub_001',
      tenantId: 'tenant_001',
      listingId: 'listing_001',
      strategyId: 'strat_001',
      allocationPercent: 25,
      currentInvestmentUsd: 10000,
    });
    expect(result.status).toBe('active');
  });

  it('should check for active subscription', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '1' }] });
    const hasActive = await repo.hasActiveSubscription('tenant_001', 'strat_001');
    expect(hasActive).toBe(true);
  });

  it('should find active subscriptions by tenant', async () => {
    mockQuery.mockResolvedValue({ rows: [mockSubscription] });
    const results = await repo.findActiveByTenant('tenant_001');
    expect(results).toHaveLength(1);
  });

  it('should update subscription status', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockSubscription, status: 'paused' }] });
    const result = await repo.update('sub_001', { status: 'paused' });
    expect(result?.status).toBe('paused');
  });

  it('should delete a subscription', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete('sub_001');
    expect(result).toBe(true);
  });
});
