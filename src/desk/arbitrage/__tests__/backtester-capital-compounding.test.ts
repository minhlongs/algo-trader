import { describe, it, expect, vi } from 'vitest';
import { Backtester } from '../backtester';
import type { BacktestConfig, PricePoint, ArbitrageOpportunity } from '../types';

describe('Backtester capital integrity', () => {
  const config: BacktestConfig = {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-02'),
    initialCapital: 10_000,
    exchanges: ['polymarket'],
    symbols: ['BTC/USDT'],
    minProfitThreshold: 0.01,
    maxPositionSize: 1_000,
  };

  const mockOpp: ArbitrageOpportunity = {
    id: 'opp-1',
    type: 'triangular',
    expectedProfit: 50,
    expectedProfitPct: 5,
    legs: [],
    totalFees: 0,
    confidence: 1,
    detectedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };

  const mockPrices: PricePoint[][] = [
    [{ exchange: 'polymarket', symbol: 'BTC/USDT', bid: 50000, ask: 50001, timestamp: Date.now() }],
    [{ exchange: 'polymarket', symbol: 'BTC/USDT', bid: 50000, ask: 50001, timestamp: Date.now() }],
  ];

  it('does not compound theoretical expectedProfit into capital', async () => {
    const backtester = new Backtester(config);

    // Mock detector to report an opportunity with 5% expected profit
    vi.spyOn(backtester['detector'], 'detectTriangularArbitrage').mockReturnValue(mockOpp);

    // Spy on processTimeSlice
    const processSpy = vi.spyOn(backtester as unknown as { processTimeSlice: (prices: PricePoint[], capital: number) => Promise<unknown> }, 'processTimeSlice');

    await backtester.run(mockPrices);

    // In the second slice, capital should NOT have grown by the first slice's expectedProfit.
    // Capital must remain the base initial capital (10,000), not 10,050.
    expect(processSpy).toHaveBeenCalledTimes(2);
    const secondCallCapital = processSpy.mock.calls[1][1];
    expect(secondCallCapital).toBe(10_000);
    expect(secondCallCapital).not.toBe(10_050);
  });
});
