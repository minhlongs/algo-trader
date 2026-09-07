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

  // ── findAll (lines 27-60) ────────────────────────────────────────────────

  it('findAll should return all listings without filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '2' }] })
      .mockResolvedValueOnce({ rows: [mockListing] });

    const result = await repo.findAll();

    expect(result.data).toEqual([mockListing]);
    expect(result.total).toBe(2);
    expect(result.totalPages).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('findAll should filter by strategyId', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [mockListing] });

    const result = await repo.findAll({ strategyId: 'strat_001' });

    expect(result.data).toEqual([mockListing]);
    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('strategy_id = $1');
  });

  it('findAll should filter by tenantId', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [mockListing] });

    const result = await repo.findAll({ tenantId: 'tenant_001' });

    expect(result.data).toEqual([mockListing]);
    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('tenant_id = $1');
  });

  it('findAll should filter by isActive', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [mockListing] });

    const result = await repo.findAll({ isActive: true });

    expect(result.data).toEqual([mockListing]);
    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('is_active = $1');
  });

  it('findAll should combine multiple filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [mockListing] });

    const result = await repo.findAll({ strategyId: 'strat_001', tenantId: 'tenant_001', isActive: true });

    expect(result.data).toEqual([mockListing]);
    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('strategy_id = $1');
    expect(countSql).toContain('tenant_id = $2');
    expect(countSql).toContain('is_active = $3');
  });

  it('findAll should use custom sort and pagination', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '10' }] })
      .mockResolvedValueOnce({ rows: [mockListing] });

    const result = await repo.findAll(
      undefined,
      { page: 2, limit: 5 },
      { field: 'price_usd_monthly', order: 'asc' }
    );

    expect(result.data).toEqual([mockListing]);
    expect(result.total).toBe(10);
    expect(result.totalPages).toBe(2);
    const dataSql = mockQuery.mock.calls[1][0];
    expect(dataSql).toContain('ORDER BY price_usd_monthly asc');
    expect(dataSql).toContain('LIMIT');
    expect(dataSql).toContain('OFFSET');
  });

  it('findAll should handle empty results', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await repo.findAll();

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  // ── findById (line ~60-73) ───────────────────────────────────────────────

  it('findById should return undefined when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await repo.findById('nonexistent');
    expect(result).toBeNull();
  });

  // ── findByStrategyId (line ~75-92) ───────────────────────────────────────

  it('findByStrategyId should return undefined when not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await repo.findByStrategyId('nonexistent');
    expect(result).toBeNull();
  });

  // ── create (lines 62-130) ────────────────────────────────────────────────

  it('should create listing with excludedTenants', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockListing, excludedTenants: ['t_excl'] }] });
    const result = await repo.create({
      id: 'listing_excl',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      priceUsdMonthly: 5000,
      billingCycle: 'monthly',
      riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
      isActive: true,
      excludedTenants: ['t_excl'],
    });
    expect(result.excludedTenants).toEqual(['t_excl']);
  });

  it('should create listing with subscriberCount', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockListing, subscriberCount: 25 }] });
    const result = await repo.create({
      id: 'listing_sub',
      strategyId: 'strat_001',
      tenantId: 'tenant_001',
      priceUsdMonthly: 5000,
      billingCycle: 'monthly',
      riskLimits: { maxDailyLossPercent: 10, maxPositionSizePercent: 20, stopLossPercent: 5, maxConcurrentTrades: 5 },
      isActive: true,
      subscriberCount: 25,
    });
    expect(result.subscriberCount).toBe(25);
  });

  // ── update (lines 132-170) ───────────────────────────────────────────────

  it('should return undefined when updating non-existent listing', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await repo.update('nonexistent', { priceUsdMonthly: 1000 });
    expect(result).toBeNull();
  });

  it('should update only changed fields', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockListing, isActive: false }] });
    const result = await repo.update('listing_001', { isActive: false });
    expect(result?.isActive).toBe(false);
  });

  // ── incrementSubscriberCount (lines 172-185) ─────────────────────────────

  it('should decrement subscriber count', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await repo.incrementSubscriberCount('listing_001', -1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('subscriber_count = subscriber_count +'),
      [-1, 'listing_001']
    );
  });

  // ── delete (lines 187-202) ──────────────────────────────────────────────

  it('should return false when deleting non-existent listing', async () => {
    mockQuery.mockResolvedValue({ rowCount: 0 });
    const result = await repo.delete('nonexistent');
    expect(result).toBe(false);
  });

  // ── count (lines 204-212) ────────────────────────────────────────────────

  it('should count without filters', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '5' }] });
    const count = await repo.count();
    expect(count).toBe(5);
  });
});
