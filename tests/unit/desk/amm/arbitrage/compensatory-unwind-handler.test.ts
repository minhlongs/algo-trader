import { describe, it, expect, vi } from 'vitest';
import { CompensatoryUnwindHandler } from '../../../../../src/desk/amm/arbitrage/compensatory-unwind-handler';
import type { ExecutionLeg } from '../../../../../src/desk/amm/types/arbitrage-types';

describe('CompensatoryUnwindHandler branch coverage', () => {
  it('returns empty result when legs are empty or null', async () => {
    const resEmpty = await CompensatoryUnwindHandler.unwindPartialFills([]);
    expect(resEmpty.completed).toBe(true);
    expect(resEmpty.unwoundSets).toBe(0);

    const resNull = await CompensatoryUnwindHandler.unwindPartialFills(null as any);
    expect(resNull.completed).toBe(true);
  });

  it('unwinds underpriced basket with pool integration and matched sets', async () => {
    const mockPool = {
      feeBps: 30,
      poolId: 'pool-1',
      mergeCompleteSets: vi.fn(),
      mintCompleteSets: vi.fn(),
      getSpotPrices: vi.fn().mockReturnValue([0.45, 0.55]),
      executeTrade: vi.fn().mockReturnValue({
        effectivePrice: 0.44,
        outputAmount: 4.4,
        inputAmount: 4.4,
      }),
    } as any;

    const legs: ExecutionLeg[] = [
      { legIndex: 0, outcomeIndex: 0, action: 'BUY', targetSize: 100, filledSize: 100, avgFillPrice: 0.45, status: 'FILLED' },
      { legIndex: 1, outcomeIndex: 1, action: 'BUY', targetSize: 100, filledSize: 80, avgFillPrice: 0.52, status: 'PARTIALLY_FILLED' },
    ];

    const result = await CompensatoryUnwindHandler.unwindPartialFills(legs, {
      opportunityType: 'UNDERPRICED_BASKET',
      pool: mockPool,
    });

    expect(result.unwoundSets).toBe(80);
    expect(mockPool.mergeCompleteSets).toHaveBeenCalledWith(80);
    expect(mockPool.executeTrade).toHaveBeenCalled();
    expect(result.completed).toBe(true);
  });

  it('unwinds overpriced basket with minting and unwind executor callback', async () => {
    const mockPool = {
      feeBps: 20,
      mintCompleteSets: vi.fn(),
    } as any;

    const legs: ExecutionLeg[] = [
      { legIndex: 0, outcomeIndex: 0, action: 'SELL', targetSize: 100, filledSize: 90, avgFillPrice: 0.55, status: 'PARTIALLY_FILLED' },
      { legIndex: 1, outcomeIndex: 1, action: 'SELL', targetSize: 100, filledSize: 70, avgFillPrice: 0.48, status: 'PARTIALLY_FILLED' },
    ];

    const mockExecutor = vi.fn().mockResolvedValue({ price: 0.54, filled: 20 });

    const result = await CompensatoryUnwindHandler.unwindPartialFills(legs, {
      opportunityType: 'OVERPRICED_BASKET',
      pool: mockPool,
      unwindExecutor: mockExecutor,
    });

    expect(result.unwoundSets).toBe(70);
    expect(mockPool.mintCompleteSets).toHaveBeenCalledWith(70);
    expect(mockExecutor).toHaveBeenCalledWith(0, 'BUY', 20);
  });

  it('handles partial liquidation failure and fallback synthetic liquidation', async () => {
    const legs: ExecutionLeg[] = [
      { legIndex: 0, action: 'BUY', targetSize: 50, filledSize: 50, avgFillPrice: 0.40, status: 'FILLED' },
      { legIndex: 1, action: 'BUY', targetSize: 50, filledSize: 20, avgFillPrice: 0.60, status: 'PARTIALLY_FILLED' },
    ];

    // Fallback liquidation (no pool or unwindExecutor)
    const result = await CompensatoryUnwindHandler.unwindPartialFills(legs);
    expect(result.unwoundSets).toBe(20);
    expect(result.completed).toBe(true);

    // Unwind executor partial fill sets allCompleted to false
    const partialExecutor = vi.fn().mockResolvedValue({ price: 0.39, filled: 10 }); // only 10 filled out of 30 surplus
    const resultPartial = await CompensatoryUnwindHandler.unwindPartialFills(legs, {
      unwindExecutor: partialExecutor,
    });
    expect(resultPartial.completed).toBe(false);

    // Unwind executor throwing error
    const throwingExecutor = vi.fn().mockRejectedValue(new Error('RPC error'));
    const resultError = await CompensatoryUnwindHandler.unwindPartialFills(legs, {
      unwindExecutor: throwingExecutor,
    });
    expect(resultError.completed).toBe(false);
  });

  it('verifies zero delta exposure for positions and legs', () => {
    expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure([])).toBe(true);
    expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure(null as any)).toBe(true);
    expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure([10, 10, 10])).toBe(true);
    expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure([10, 12, 10])).toBe(false);

    const balancedLegs: ExecutionLeg[] = [
      { legIndex: 0, action: 'BUY', targetSize: 10, filledSize: 10, avgFillPrice: 0.5, status: 'FILLED' },
      { legIndex: 1, action: 'BUY', targetSize: 10, filledSize: 10, avgFillPrice: 0.5, status: 'FILLED' },
    ];
    expect(CompensatoryUnwindHandler.verifyZeroDeltaExposure(balancedLegs)).toBe(true);
  });
});
