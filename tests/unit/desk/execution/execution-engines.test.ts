import { describe, it, expect } from 'vitest';
import { DynamicGasPricer } from '../../../../src/desk/execution/dynamic-gas-pricer';
import { ExecutionSlippageTracker } from '../../../../src/desk/execution/execution-slippage-tracker';
import { SmartCrossRouter } from '../../../../src/desk/execution/smart-cross-router';

describe('Execution & Routing Trilogy', () => {
  describe('DynamicGasPricer', () => {
    const pricer = new DynamicGasPricer();

    it('escalates base fee when block congestion exceeds target', () => {
      // 100% full block -> max 12.5% increase
      const nextBaseFee = pricer.forecastNextBaseFeeGwei({
        blockNumber: 1000,
        baseFeeGwei: 20,
        gasUsed: 30000000,
        gasLimit: 30000000,
      });
      expect(nextBaseFee).toBeCloseTo(22.5, 1);
    });

    it('calibrates MEV priority fee based on expected arbitrage profit', () => {
      const rec = pricer.calculateRecommendation({
        urgency: 'CRITICAL_ARBITRAGE',
        latestBlock: { blockNumber: 1000, baseFeeGwei: 25, gasUsed: 15000000, gasLimit: 30000000 },
        expectedProfitUsd: 500,
        ethPriceUsd: 3000,
        estimatedGasUnits: 200000,
      });

      expect(rec.priorityFeeGwei).toBeGreaterThan(15);
      expect(rec.profitRetentionPct).toBeGreaterThan(50);
      expect(rec.estimatedTotalCostUsd).toBeLessThan(250);
    });
  });

  describe('ExecutionSlippageTracker', () => {
    const tracker = new ExecutionSlippageTracker();

    it('accurately attributes adverse slippage and fees', () => {
      const attribution = tracker.recordExecution({
        orderId: 'ord-1',
        marketId: 'm-eth-up',
        venue: 'Polymarket',
        side: 'BUY',
        requestedQuantity: 1000,
        filledQuantity: 1000,
        arrivalMidPrice: 0.50,
        executedAvgPrice: 0.505, // 10 bps slippage
        feesPaidUsd: 1.0,
        executionLatencyMs: 45,
        timestamp: Date.now(),
      });

      expect(attribution.slippageBps).toBeCloseTo(100, 1);
      expect(attribution.slippageCostUsd).toBe(5);
      expect(attribution.grade).toBe('POOR');
    });

    it('aggregates venue quality benchmark', () => {
      tracker.recordExecution({
        orderId: 'ord-2',
        marketId: 'm-eth-up',
        venue: 'Polymarket',
        side: 'BUY',
        requestedQuantity: 500,
        filledQuantity: 500,
        arrivalMidPrice: 0.50,
        executedAvgPrice: 0.5002, // 4 bps slippage -> EXCELLENT
        feesPaidUsd: 0.5,
        executionLatencyMs: 30,
        timestamp: Date.now(),
      });

      const bench = tracker.getVenueBenchmark('Polymarket');
      expect(bench).not.toBeNull();
      expect(bench!.totalOrders).toBe(2);
      expect(bench!.avgLatencyMs).toBeCloseTo(37.5, 1);
    });
  });

  describe('SmartCrossRouter', () => {
    const router = new SmartCrossRouter();

    it('optimally splits order across AMM and CLOB to minimize blended price', () => {
      const split = router.optimizeSplit({
        totalQuantity: 2000,
        ammPool: {
          poolId: 'amm-pool-1',
          reserveOutcome: 10000,
          reserveCollateral: 5000,
          feeRate: 0.003,
        },
        clobBook: {
          bookId: 'clob-book-1',
          asks: [
            { price: 0.52, availableQuantity: 1000 },
            { price: 0.55, availableQuantity: 1500 },
          ],
          feeRate: 0.001,
        },
      });

      expect(split.totalAllocatedQuantity).toBe(2000);
      expect(split.allocations.length).toBeGreaterThanOrEqual(1);
      expect(split.blendedAvgPrice).toBeGreaterThan(0.50);
      expect(split.blendedAvgPrice).toBeLessThan(0.60);
    });
  });
});
