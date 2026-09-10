import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CrossExchangeExecutor } from '@desk/arbitrage/executors/cross-exchange-executor';
import type {
  ArbitrageOpportunity,
  ExecutionResult,
} from '@desk/arbitrage/types';

const mockExecute = vi.fn();
const mockValidateOpportunity = vi.fn().mockReturnValue(true);

vi.mock('@desk/arbitrage/executor', () => ({
  ExecutionEngine: vi.fn().mockImplementation(function (this: { execute: typeof mockExecute; validateOpportunity: typeof mockValidateOpportunity }) {
    this.execute = mockExecute;
    this.validateOpportunity = mockValidateOpportunity;
  }),
}));

describe('CrossExchangeExecutor', () => {
  let executor: CrossExchangeExecutor;
  const mockOpportunity: ArbitrageOpportunity = {
    id: 'test-opp-1',
    type: 'cross-exchange',
    legs: [
      {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy',
        amount: 0.01,
        price: 50000,
      },
    ],
    expectedProfit: 15,
    expectedProfitPct: 0.03,
    totalFees: 5,
    confidence: 85,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60000,
  };

  const successResult: ExecutionResult = {
    opportunityId: 'test-opp-1',
    success: true,
    executedLegs: [],
    actualProfit: 12,
    actualProfitPct: 0.024,
    totalFees: 3,
    executedAt: Date.now(),
  };

  const failResult: ExecutionResult = {
    opportunityId: 'test-opp-1',
    success: false,
    executedLegs: [],
    actualProfit: 0,
    actualProfitPct: 0,
    totalFees: 0,
    error: 'Execution failed',
    executedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOpportunity.mockReturnValue(true);
    executor = new CrossExchangeExecutor({ dryRun: true });
  });

  it('should track opportunities received on execute', async () => {
    mockExecute.mockResolvedValue(successResult);

    await executor.execute(mockOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesReceived).toBe(1);
  });

  it('should increment opportunitiesExecuted on success', async () => {
    mockExecute.mockResolvedValue(successResult);

    const result = await executor.execute(mockOpportunity);

    expect(result.success).toBe(true);
    expect(result.actualProfit).toBe(12);
    const metrics = executor.getMetrics();
    expect(metrics.opportunitiesExecuted).toBe(1);
    expect(metrics.totalProfit).toBe(12);
  });

  it('should increment errors on failure', async () => {
    mockExecute.mockResolvedValue(failResult);

    const result = await executor.execute(mockOpportunity);

    expect(result.success).toBe(false);
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should return error ExecutionResult on thrown exception', async () => {
    mockExecute.mockRejectedValue(new Error('Redis timeout'));

    const result = await executor.execute(mockOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Redis timeout');
    const metrics = executor.getMetrics();
    expect(metrics.errors).toBe(1);
  });

  it('should track latency metrics', async () => {
    mockExecute.mockResolvedValue(successResult);

    await executor.execute(mockOpportunity);

    const metrics = executor.getMetrics();
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should validate opportunity via engine', () => {
    mockValidateOpportunity.mockReturnValue(true);

    const isValid = executor.validate(mockOpportunity);

    expect(isValid).toBe(true);
    expect(mockValidateOpportunity).toHaveBeenCalledWith(mockOpportunity);
  });

  it('should return a copy of metrics (not reference)', () => {
    const metrics1 = executor.getMetrics();
    const metrics2 = executor.getMetrics();
    expect(metrics1).toEqual(metrics2);
    expect(metrics1).not.toBe(metrics2);
  });

  it('should drop the oldest latency sample once the buffer exceeds 1000', async () => {
    mockExecute.mockResolvedValue(successResult);

    // Execute 1001 times to push latencySamples past the 1000 cap.
    for (let i = 0; i < 1001; i++) {
      await executor.execute(mockOpportunity);
    }

    const internal = executor as unknown as { latencySamples: number[] };
    expect(internal.latencySamples.length).toBe(1000);
  });

  it('should coerce a non-Error throw into "Unknown error"', async () => {
    mockExecute.mockRejectedValue('a string error');

    const result = await executor.execute(mockOpportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });
});
