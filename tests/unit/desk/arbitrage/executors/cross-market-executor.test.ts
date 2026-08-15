import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrossMarketArbitrageExecutor } from '@desk/arbitrage/executors/cross-market-executor';
import type {
  ArbitrageOpportunity,
  ExecutionResult,
} from '@desk/arbitrage/types';
import type { DependencyGraph } from '@shared/types/semantic-relationships';

const mockDetectCrossMarketArbitrage = vi.fn();

vi.mock('@desk/arbitrage/cross-market-arbitrage-detector', () => ({
  detectCrossMarketArbitrage: (...args: unknown[]) => mockDetectCrossMarketArbitrage(...args),
}));

describe('CrossMarketArbitrageExecutor', () => {
  let executor: CrossMarketArbitrageExecutor;

  const mockGraph: DependencyGraph = {
    relationships: [],
    marketCount: 0,
    updatedAt: Date.now(),
  };

  const crossMarketOpportunity = {
    id: 'cross-1',
    type: 'cross-market' as const,
    legs: [
      {
        exchange: 'polymarket' as const,
        symbol: 'market-a-yes',
        side: 'buy' as const,
        amount: 100,
        price: 0.5,
      },
    ],
    expectedProfit: 20,
    expectedProfitPct: 4,
    totalFees: 3,
    confidence: 88,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
    basket: {
      id: 'basket-1',
      positions: [
        {
          marketId: 'market-a',
          side: 'YES' as const,
          size: 100,
          expectedProfit: 15,
        },
      ],
      totalExpectedProfit: 15,
      totalCost: 100,
    },
  };

  const nonCrossMarketOpportunity: ArbitrageOpportunity = {
    id: 'not-cross-1',
    type: 'triangular',
    legs: [],
    expectedProfit: 5,
    expectedProfitPct: 2,
    totalFees: 1,
    confidence: 70,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  const mockDetectorResult = {
    basket: {
      id: 'basket-1',
      positions: [
        {
          marketId: 'market-a',
          side: 'YES' as const,
          size: 100,
          expectedProfit: 15,
        },
      ],
      totalExpectedProfit: 15,
      totalCost: 100,
    },
    edge: 0.15,
    solverStatus: 'optimal' as const,
  };

  const emptyDetectorResult = {
    basket: null,
    edge: 0,
    solverStatus: 'infeasible' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new CrossMarketArbitrageExecutor({ dryRun: true });
  });

  it('should reject when dependency graph is not configured', async () => {
    const result = await executor.execute(crossMarketOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Dependency graph not configured for cross-market arbitrage',
    );
    expect(result.opportunityId).toBe('cross-1');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should reject non-cross-market opportunities', async () => {
    executor.setDependencyGraph(mockGraph);

    const result = await executor.execute(nonCrossMarketOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not a cross-market arbitrage opportunity');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should call detectCrossMarketArbitrage with graph and config', async () => {
    mockDetectCrossMarketArbitrage.mockReturnValue(mockDetectorResult);
    executor.setDependencyGraph(mockGraph);

    await executor.execute(crossMarketOpportunity);

    expect(mockDetectCrossMarketArbitrage).toHaveBeenCalledWith(
      expect.any(Array),
      mockGraph,
      expect.objectContaining({
        budgetUsdc: 10000,
        maxMarketExposureFraction: 0.2,
        minEdgeThreshold: 0.025,
        feeRate: 0.02,
        timeoutMs: 500,
      }),
    );
  });

  it('should return success when basket is found', async () => {
    mockDetectCrossMarketArbitrage.mockReturnValue(mockDetectorResult);
    executor.setDependencyGraph(mockGraph);

    const result = await executor.execute(crossMarketOpportunity);

    expect(result.success).toBe(true);
    expect(result.actualProfit).toBe(15);
    expect(result.executedLegs.length).toBeGreaterThan(0);
    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesExecuted).toBe(1);
  });

  it('should return failure when no valid basket found', async () => {
    mockDetectCrossMarketArbitrage.mockReturnValue(emptyDetectorResult);
    executor.setDependencyGraph(mockGraph);

    const result = await executor.execute(crossMarketOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No valid basket found');
    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesReceived).toBe(1);
  });

  it('should handle detector errors gracefully', async () => {
    mockDetectCrossMarketArbitrage.mockImplementation(() => {
      throw new Error('Solver timeout');
    });
    executor.setDependencyGraph(mockGraph);

    const result = await executor.execute(crossMarketOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Solver timeout');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should validate cross-market opportunities only when graph is set', () => {
    expect(executor.validate(crossMarketOpportunity)).toBe(false);

    executor.setDependencyGraph(mockGraph);
    expect(executor.validate(crossMarketOpportunity)).toBe(true);
  });

  it('should reject non-cross-market on validate', () => {
    executor.setDependencyGraph(mockGraph);
    expect(executor.validate(nonCrossMarketOpportunity)).toBe(false);
  });

  it('should track latency metrics', async () => {
    mockDetectCrossMarketArbitrage.mockReturnValue(mockDetectorResult);
    executor.setDependencyGraph(mockGraph);

    await executor.execute(crossMarketOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
