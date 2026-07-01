/**
 * Strategy Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrategyRepository } from '../repositories/strategy-repository';
import type { IMarketplaceStrategy } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../../shared/db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('StrategyRepository', () => {
  let repo: StrategyRepository;

  beforeEach(() => {
    repo = new StrategyRepository();
    mockQuery.mockClear();
  });

  const mockStrategy: IMarketplaceStrategy = {
    id: 'strat_001',
    tenantId: 'tenant_001',
    creatorId: 'creator_001',
    name: 'Test Strategy',
    description: 'A test trading strategy',
    category: 'momentum',
    status: 'draft',
    riskLevel: 5,
    minAllocationUsd: 1000,
    maxAllocationUsd: 50000,
    supportedExchanges: ['binance'],
    tags: ['momentum', 'crypto'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should find strategy by id', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockStrategy }] });
    const result = await repo.findById('strat_001');
    expect(result).toEqual(mockStrategy);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM marketplace_strategies WHERE id = $1'),
      ['strat_001']
    );
  });

  it('should return null when strategy not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await repo.findById('nonexistent');
    expect(result).toBeNull();
  });

  it('should create a new strategy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockStrategy }] });
    const result = await repo.create({
      id: 'strat_001',
      tenantId: 'tenant_001',
      creatorId: 'creator_001',
      name: 'Test Strategy',
      description: 'A test trading strategy',
      category: 'momentum',
      riskLevel: 5,
      minAllocationUsd: 1000,
      maxAllocationUsd: 50000,
      supportedExchanges: ['binance'],
      tags: ['momentum'],
    });
    expect(result).toEqual(mockStrategy);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO marketplace_strategies'),
      expect.arrayContaining(['strat_001', 'tenant_001'])
    );
  });

  it('should update a strategy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockStrategy, name: 'Updated Strategy' }] });
    const result = await repo.update('strat_001', { name: 'Updated Strategy' });
    expect(result?.name).toBe('Updated Strategy');
  });

  it('should delete a strategy', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete('strat_001');
    expect(result).toBe(true);
  });

  it('should count strategies with filters', async () => {
    mockQuery.mockResolvedValue({ rows: [{ total: '5' }] });
    const count = await repo.count({ status: 'draft' });
    expect(count).toBe(5);
  });

  it('should find strategies by status', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockStrategy, status: 'pending_vetting' }] });
    const results = await repo.findByStatus('pending_vetting');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('pending_vetting');
  });

  it('should update strategy status', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...mockStrategy, status: 'approved' }] });
    const result = await repo.updateStatus('strat_001', 'approved');
    expect(result?.status).toBe('approved');
  });

  it('should find latest performance for strategy', async () => {
    mockQuery.mockResolvedValue({ rows: [{ strategyId: 'strat_001', totalTrades: 10 }] });
    const result = await repo.findLatestPerformance('strat_001');
    expect(result).toBeDefined();
    expect(result?.strategyId).toBe('strat_001');
  });
});
