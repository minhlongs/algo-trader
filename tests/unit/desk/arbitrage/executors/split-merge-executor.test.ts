import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SplitMergeArbitrageExecutor } from '@desk/arbitrage/executors/split-merge-executor';
import type {
  ArbitrageOpportunity,
  ExecutionResult,
} from '@desk/arbitrage/types';

const mockExecutePaperSplitMerge = vi.fn();

vi.mock('@desk/arbitrage/split-merge-arb-executor', () => ({
  executePaperSplitMerge: (...args: unknown[]) => mockExecutePaperSplitMerge(...args),
}));

vi.mock('../../../../../src/shared/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SplitMergeArbitrageExecutor', () => {
  let executor: SplitMergeArbitrageExecutor;

  const settlementOpportunity: ArbitrageOpportunity = {
    id: 'settlement-1',
    type: 'settlement-arb',
    legs: [
      {
        exchange: 'polymarket',
        symbol: 'event-1-yes',
        side: 'buy',
        amount: 100,
        price: 0.45,
      },
      {
        exchange: 'polymarket',
        symbol: 'event-1-no',
        side: 'buy',
        amount: 100,
        price: 0.45,
      },
    ],
    expectedProfit: 10,
    expectedProfitPct: 5,
    totalFees: 2,
    confidence: 95,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
    marketId: 'settlement-1',
    yesPrice: 0.45,
    noPrice: 0.45,
  } as ArbitrageOpportunity;

  const nonSettlementOpportunity: ArbitrageOpportunity = {
    id: 'not-settlement-1',
    type: 'triangular',
    legs: [],
    expectedProfit: 5,
    expectedProfitPct: 2,
    totalFees: 1,
    confidence: 70,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  const mockTrade = {
    id: 'sm-1234',
    marketId: 'settlement-1',
    side: 'YES' as const,
    size: 1000,
    entryPrice: 1.0,
    strategy: 'split-merge-arb',
    source: 'legacy',
    signalConfidence: 1.0,
    swarmApproved: true,
    aiValidated: true,
    timestamp: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new SplitMergeArbitrageExecutor({
      maxPositionSize: 1000,
      dryRun: true,
    });
  });

  it('should reject non-settlement opportunities', async () => {
    const result = await executor.execute(nonSettlementOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not a split-merge arbitrage opportunity');
    expect(result.opportunityId).toBe('not-settlement-1');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should convert opportunity to SplitMergeOpportunity format', async () => {
    mockExecutePaperSplitMerge.mockResolvedValue(mockTrade);

    await executor.execute(settlementOpportunity);

    expect(mockExecutePaperSplitMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        marketId: 'settlement-1',
        title: 'settlement-1',
      }),
      1000,
    );
  });

  it('should return success result when trade is profitable', async () => {
    mockExecutePaperSplitMerge.mockResolvedValue(mockTrade);

    const result = await executor.execute(settlementOpportunity);

    expect(result.success).toBe(true);
    expect(result.opportunityId).toBe('settlement-1');
    expect(result.actualProfit).toBeGreaterThan(0);
    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesExecuted).toBe(1);
  });

  it('should track total profit correctly', async () => {
    mockExecutePaperSplitMerge.mockResolvedValue(mockTrade);

    await executor.execute(settlementOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.totalProfit).toBeGreaterThan(0);
    expect(metrics.opportunitiesReceived).toBe(1);
  });

  it('should handle executePaperSplitMerge errors gracefully', async () => {
    mockExecutePaperSplitMerge.mockRejectedValue(new Error('API timeout'));

    const result = await executor.execute(settlementOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('API timeout');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should validate settlement-arb opportunities', () => {
    expect(executor.validate(settlementOpportunity)).toBe(true);
  });

  it('should reject non-settlement opportunities on validate', () => {
    expect(executor.validate(nonSettlementOpportunity)).toBe(false);
  });

  it('should track latency metrics', async () => {
    mockExecutePaperSplitMerge.mockResolvedValue(mockTrade);

    await executor.execute(settlementOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });
});
