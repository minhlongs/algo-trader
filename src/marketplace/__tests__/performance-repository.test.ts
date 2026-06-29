/**
 * Performance Repository Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceRepository } from '../repositories/performance-repository';
import type { IMarketplacePerformance } from '../models/types';

const mockQuery = vi.fn();

vi.mock('../../db/postgres-client', () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

describe('PerformanceRepository', () => {
  let repo: PerformanceRepository;

  beforeEach(() => {
    repo = new PerformanceRepository();
    mockQuery.mockClear();
  });

  const mockPerformance: IMarketplacePerformance = {
    id: 1,
    strategyId: 'strat_001',
    tenantId: null,
    date: new Date('2024-01-15'),
    sharpeRatio: 1.5,
    maxDrawdown: 15,
    totalPnlUsd: 5000,
    winRate: 60,
    totalTrades: 100,
    winningTrades: 60,
    losingTrades: 40,
    avgWinUsd: 100,
    avgLossUsd: 50,
    profitFactor: 2.0,
    volatility: 12,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };

  it('should find performance by id', async () => {
    mockQuery.mockResolvedValue({ rows: [mockPerformance] });
    const result = await repo.findById(1);
    expect(result).toEqual(mockPerformance);
  });

  it('should create performance record', async () => {
    mockQuery.mockResolvedValue({ rows: [mockPerformance] });
    const result = await repo.create({
      strategyId: 'strat_001',
      date: new Date('2024-01-15'),
      sharpeRatio: 1.5,
      maxDrawdown: 15,
      totalPnlUsd: 5000,
      winRate: 60,
      totalTrades: 100,
    });
    expect(result.strategyId).toBe('strat_001');
  });

  it('should upsert performance record', async () => {
    const updated = { ...mockPerformance, sharpeRatio: 1.8, maxDrawdown: 12, totalPnlUsd: 6000, winRate: 65, totalTrades: 120 };
    mockQuery.mockResolvedValue({ rows: [updated] });
    const result = await repo.upsert({
      strategyId: 'strat_001',
      date: new Date('2024-01-15'),
      sharpeRatio: 1.8,
      maxDrawdown: 12,
      totalPnlUsd: 6000,
      winRate: 65,
      totalTrades: 120,
    });
    expect(result.sharpeRatio).toBeCloseTo(1.8);
    expect(result.totalPnlUsd).toBe(6000);
  });

  it('should get latest performance for strategy', async () => {
    mockQuery.mockResolvedValue({ rows: [mockPerformance] });
    const results = await repo.getLatestByStrategy('strat_001', 5);
    expect(results).toHaveLength(1);
    expect(results[0].strategyId).toBe('strat_001');
  });

  it('should find by strategy and date', async () => {
    mockQuery.mockResolvedValue({ rows: [mockPerformance] });
    const result = await repo.findByStrategyAndDate('strat_001', new Date('2024-01-15'));
    expect(result?.sharpeRatio).toBeCloseTo(1.5);
  });

  it('should delete performance record', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    const result = await repo.delete(1);
    expect(result).toBe(true);
  });
});
