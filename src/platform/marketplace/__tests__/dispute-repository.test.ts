/**
 * Dispute Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DisputeRepository } from '../repositories/dispute-repository';
import type { IMarketplaceDispute } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../../shared/db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('DisputeRepository', () => {
  let repo: DisputeRepository;

  beforeEach(() => {
    repo = new DisputeRepository();
    mockQuery.mockClear();
  });

  const mockDispute: IMarketplaceDispute = {
    id: 'dispute_001',
    tenantId: 'tenant_001',
    listingId: 'listing_001',
    subscriptionId: 'sub_001',
    reason: 'performance_not_as_described',
    description: 'Strategy performance does not match claims',
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

  it('should find dispute by id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockDispute] });
    const result = await repo.findById('dispute_001');
    expect(result).toEqual(mockDispute);
  });

  it('should create a dispute', async () => {
    mockQuery.mockResolvedValue({ rows: [mockDispute] });
    const result = await repo.create({
      id: 'dispute_001',
      tenantId: 'tenant_001',
      listingId: 'listing_001',
      subscriptionId: 'sub_001',
      reason: 'performance_not_as_described',
      description: 'Strategy performance does not match claims',
    });
    expect(result.status).toBe('open');
  });

  it('should update dispute', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockDispute, status: 'resolved_subscriber' }] });
    const result = await repo.update('dispute_001', { status: 'resolved_subscriber' });
    expect(result?.status).toBe('resolved_subscriber');
  });

  it('should count disputes with filters', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '2' }] });
    const count = await repo.count({ status: 'open' });
    expect(count).toBe(2);
  });

  it('should delete a dispute', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete('dispute_001');
    expect(result).toBe(true);
  });
});
