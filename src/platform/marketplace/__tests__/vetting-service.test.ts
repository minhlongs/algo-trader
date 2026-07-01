/**
 * Vetting Service Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VettingService } from '../services/vetting.service';

const { mockStrategyRepo: mockVSRepo, mockVettingRepo: mockVVRepo } = vi.hoisted(() => {
  const mockStrategyRepo = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    findByStatus: vi.fn(),
    findLatestPerformance: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  };
  const mockVettingRepo = {
    findById: vi.fn(),
    findByStrategyId: vi.fn(),
    create: vi.fn(),
    findAll: vi.fn(),
    count: vi.fn(),
    complete: vi.fn(),
  };
  return { mockStrategyRepo, mockVettingRepo };
});

vi.mock('../repositories/strategy-repository', () => ({
  StrategyRepository: vi.fn().mockImplementation(() => mockVSRepo),
}));

vi.mock('../repositories/vetting-job-repository', () => ({
  VettingJobRepository: vi.fn().mockImplementation(() => mockVVRepo),
}));

describe('VettingService', () => {
  let service: VettingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VettingService(mockVSRepo as any, mockVVRepo as any);
  });

  const mockStrategy = {
    id: 'strat_001',
    tenantId: 'tenant_001',
    creatorId: 'creator_001',
    name: 'Test Strategy',
    description: 'A test strategy',
    category: 'momentum' as const,
    status: 'draft',
    riskLevel: 5,
    minAllocationUsd: 1000,
    maxAllocationUsd: 50000,
    supportedExchanges: ['binance'],
    tags: ['momentum'],
    backtestSummary: {
      sharpe: 1.5,
      maxDrawdown: 15,
      winRate: 60,
      periodDays: 120,
      totalTrades: 200,
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('should submit strategy for vetting', async () => {
    mockVSRepo.findById.mockResolvedValue(mockStrategy);
    mockVSRepo.updateStatus.mockResolvedValue({ ...mockStrategy, status: 'pending_vetting' });
    mockVVRepo.create.mockResolvedValue({ id: 1, strategyId: 'strat_001', decision: 'queued' });
    const result = await service.submitForVetting('strat_001', 'tenant_001');
    expect(result.strategyId).toBe('strat_001');
    expect(mockVSRepo.updateStatus).toHaveBeenCalledWith('strat_001', 'pending_vetting');
  });

  it('should throw when submitting non-draft strategy', async () => {
    mockVSRepo.findById.mockResolvedValue({ ...mockStrategy, status: 'approved' });
    await expect(service.submitForVetting('strat_001', 'tenant_001')).rejects.toThrow(
      'Cannot submit strategy with status: approved'
    );
  });

  it('should approve a strategy', async () => {
    mockVSRepo.findById.mockResolvedValue({ ...mockStrategy, status: 'pending_vetting' });
    mockVSRepo.updateStatus.mockResolvedValue({ ...mockStrategy, status: 'approved' });
    const result = await service.approveStrategy('strat_001', 'admin_001', 'Looks good');
    expect(result?.status).toBe('approved');
  });

  it('should reject a strategy', async () => {
    mockVSRepo.findById.mockResolvedValue({ ...mockStrategy, status: 'pending_vetting' });
    mockVSRepo.update.mockResolvedValue({ ...mockStrategy, status: 'rejected', rejectionReason: 'Poor metrics' });
    const result = await service.rejectStrategy('strat_001', 'admin_001', 'Poor metrics');
    expect(result?.status).toBe('rejected');
  });

  it('should request changes', async () => {
    mockVSRepo.findById.mockResolvedValue({ ...mockStrategy, status: 'pending_vetting' });
    mockVSRepo.updateStatus.mockResolvedValue({ ...mockStrategy, status: 'draft' });
    const result = await service.requestChanges('strat_001', 'admin_001', 'Need better Sharpe');
    expect(result?.status).toBe('draft');
  });

  it('should get vetting history', async () => {
    mockVVRepo.findByStrategyId.mockResolvedValue([
      { id: 1, strategyId: 'strat_001', decision: 'approved', createdAt: new Date('2024-01-01'), adminId: 'admin_001', notes: null },
    ]);
    const result = await service.getVettingHistory('strat_001');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('approved');
  });

  it('should get pending strategies', async () => {
    mockVSRepo.findByStatus.mockResolvedValue([mockStrategy]);
    const result = await service.getPendingStrategies();
    expect(result).toHaveLength(1);
    expect(mockVSRepo.findByStatus).toHaveBeenCalledWith('pending_vetting', undefined);
  });

  it('should run vetting checks on good strategy', async () => {
    mockVSRepo.findById.mockResolvedValue(mockStrategy);
    const result = await service.runVettingChecks('strat_001');
    expect(result.approved).toBe(true);
    expect(result.score).toBe(100);
  });

  it('should run vetting checks on bad strategy', async () => {
    const badStrategy = {
      ...mockStrategy,
      backtestSummary: {
        sharpe: 0.5,
        maxDrawdown: 35,
        winRate: 30,
        periodDays: 60,
        totalTrades: 50,
      },
    };
    mockVSRepo.findById.mockResolvedValue(badStrategy);
    const result = await service.runVettingChecks('strat_001');
    expect(result.approved).toBe(false);
    expect(result.score).toBeLessThan(100);
  });

  it('should throw for nonexistent strategy during vetting', async () => {
    mockVSRepo.findById.mockResolvedValue(null);
    await expect(service.runVettingChecks('nonexistent')).rejects.toThrow('Strategy not found');
  });
});
