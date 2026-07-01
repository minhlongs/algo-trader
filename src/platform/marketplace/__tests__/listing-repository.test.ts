/**
 * Listing Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ListingRepository } from '../repositories/listing-repository';
import type { IMarketplaceListing } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../../shared/db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('ListingRepository', () => {
  let repo: ListingRepository;

  beforeEach(() => {
    repo = new ListingRepository();
    mockQuery.mockClear();
  });

  const mockListing: IMarketplaceListing = {
    id: 'listing_001',
    strategyId: 'strat_001',
    tenantId: 'tenant_001',
    priceUsdMonthly: 5000,
    billingCycle: 'monthly',
    riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
    allowedTenants: [],
    excludedTenants: [],
    isActive: true,
    subscriberCount: 10,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should find listing by id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockListing] });
    const result = await repo.findById('listing_001');
    expect(result).toEqual(mockListing);
  });

  it('should find listing by strategy id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockListing] });
    const result = await repo.findByStrategyId('strat_001');
    expect(result?.id).toBe('listing_001');
  });

  it('should create a listing', async () => {
    mockQuery.mockResolvedValue({ rows: [mockListing] });
    const result = await repo.create({
      id: 'listing_001',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      priceUsdMonthly: 5000,
      billingCycle: 'monthly',
      riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
      isActive: true,
    });
    expect(result.priceUsdMonthly).toBe(5000);
  });

  it('should update a listing', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockListing, priceUsdMonthly: 6000 }] });
    const result = await repo.update('listing_001', { priceUsdMonthly: 6000 });
    expect(result?.priceUsdMonthly).toBe(6000);
  });

  it('should increment subscriber count', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await repo.incrementSubscriberCount('listing_001');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('subscriber_count = subscriber_count +'),
      [1, 'listing_001']
    );
  });

  it('should delete a listing', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete('listing_001');
    expect(result).toBe(true);
  });

  it('should count listings', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '3' }] });
    const count = await repo.count({ isActive: true });
    expect(count).toBe(3);
  });
});
