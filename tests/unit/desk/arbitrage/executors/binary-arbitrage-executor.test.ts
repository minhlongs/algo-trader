import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BinaryArbitrageStrategyExecutor } from '@desk/arbitrage/executors/binary-arbitrage-executor';
import type {
  ArbitrageOpportunity,
  ExecutionResult,
} from '@desk/arbitrage/types';

const mockBinaryExecute = vi.fn();

vi.mock('@desk/arbitrage/binary-arbitrage-executor', () => {
  return {
    BinaryArbitrageExecutor: vi.fn().mockImplementation(function (this: { execute: typeof mockBinaryExecute }) {
      this.execute = mockBinaryExecute;
    }),
  };
});

describe('BinaryArbitrageStrategyExecutor', () => {
  let executor: BinaryArbitrageStrategyExecutor;

  const binaryOpportunity: ArbitrageOpportunity = {
    id: 'binary-1',
    type: 'binary-arb',
    legs: [
      {
        exchange: 'polymarket',
        symbol: 'event-1-yes',
        side: 'buy',
        amount: 100,
        price: 0.45,
      },
    ],
    expectedProfit: 10,
    expectedProfitPct: 5,
    totalFees: 2,
    confidence: 80,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  const nonBinaryOpportunity: ArbitrageOpportunity = {
    id: 'not-binary-1',
    type: 'triangular',
    legs: [],
    expectedProfit: 5,
    expectedProfitPct: 2,
    totalFees: 1,
    confidence: 70,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  const successResult: ExecutionResult = {
    opportunityId: 'binary-1',
    success: true,
    executedLegs: [],
    actualProfit: 8,
    actualProfitPct: 4,
    totalFees: 2,
    executedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    executor = new BinaryArbitrageStrategyExecutor({ dryRun: true });
  });

  it('should reject non-binary opportunities', async () => {
    const result = await executor.execute(nonBinaryOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not a binary arbitrage opportunity');
    expect(result.opportunityId).toBe('not-binary-1');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should track metrics for rejected opportunities', async () => {
    await executor.execute(nonBinaryOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesReceived).toBe(1);
    expect(metrics.opportunitiesExecuted).toBe(0);
    expect(metrics.errors).toBe(1);
  });

  it('should delegate to BinaryArbitrageExecutor for binary opportunities', async () => {
    mockBinaryExecute.mockResolvedValue(successResult);

    const result = await executor.execute(binaryOpportunity);

    expect(result.success).toBe(true);
    expect(result.actualProfit).toBe(8);
    expect(mockBinaryExecute).toHaveBeenCalled();
  });

  it('should increment opportunitiesExecuted on success', async () => {
    mockBinaryExecute.mockResolvedValue(successResult);

    await executor.execute(binaryOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesExecuted).toBe(1);
    expect(metrics.totalProfit).toBe(8);
  });

  it('should increment errors when BinaryArbitrageExecutor fails', async () => {
    mockBinaryExecute.mockResolvedValue({
      ...successResult,
      success: false,
    });

    await executor.execute(binaryOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should return error result on thrown exception', async () => {
    mockBinaryExecute.mockRejectedValue(new Error('Network error'));

    const result = await executor.execute(binaryOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should validate binary opportunities correctly', () => {
    expect(executor.validate(binaryOpportunity)).toBe(true);
  });

  it('should reject non-binary opportunities on validate', () => {
    expect(executor.validate(nonBinaryOpportunity)).toBe(false);
  });

  it('should reject binary opportunity with no legs on validate', () => {
    const noLegsOpp: ArbitrageOpportunity = {
      ...binaryOpportunity,
      legs: [],
    };
    expect(executor.validate(noLegsOpp)).toBe(false);
  });
});
