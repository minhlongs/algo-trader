import { describe, it, expect } from 'vitest';
import {
  ENGINE_IDS,
  PortfolioAllocator,
} from '../../../../src/desk/portfolio';
import {
  GlobalCircuitBreaker,
  EngineSynchronizer,
} from '../fixtures/risk-contract.fixture';
import {
  WaterFillingOptimizer,
  OrderSplittingGate,
  TwapExecutor,
  VwapExecutor,
  IcebergExecutor,
  PriceImprovementVerifier,
} from '../fixtures/sor-contract.fixture';
import {
  createBalancedEngineReturns,
  createMockOrderBooks,
  MockEngineRiskAdapter,
} from '../fixtures/test-data.fixture';

export function registerTier4Workloads1To4(): void {
  describe('Tier 4: Real-World Workloads (Scenarios 1 - 4)', () => {
    it('Scenario 1: Multi-Engine Equilibrium Allocation across regimes', () => {
      const allocator = new PortfolioAllocator();
      const returns = createBalancedEngineReturns(40);
      returns.forEach((r) => allocator.updateReturns(r));

      const allocation = allocator.allocate({
        totalNavUsd: 250000,
        currentAllocations: { arbitrage: 50000, marl: 50000, amm: 50000, 'alpha-lab': 50000 },
        lockedCapital: { arbitrage: 10000, marl: 10000, amm: 10000, 'alpha-lab': 10000 },
        regime: 'TRENDING',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 2.1, rollingSortino: 2.8, rollingVolatility: 0.04, totalPnlUsd: 8500 },
          marl: { engineId: 'marl', rollingSharpe: 1.4, rollingSortino: 1.6, rollingVolatility: 0.09, totalPnlUsd: 4200 },
          amm: { engineId: 'amm', rollingSharpe: 1.1, rollingSortino: 1.3, rollingVolatility: 0.07, totalPnlUsd: 3100 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 2.5, rollingSortino: 3.2, rollingVolatility: 0.06, totalPnlUsd: 11000 },
        },
      });

      expect(allocation.cashBufferRatio).toBeGreaterThanOrEqual(0.20);
      expect(allocation.unallocatedCashUsd).toBeGreaterThanOrEqual(50000);
      expect(allocation.maxRiskDiscrepancy).toBeLessThanOrEqual(1e-4);
      expect(allocation.allocatedCapitalUsd['alpha-lab']).toBeGreaterThan(allocation.allocatedCapitalUsd.amm);
    });

    it('Scenario 2: Flash Crash & Multi-Tier Breaker Propagation to All Engines', async () => {
      const adapters = [
        new MockEngineRiskAdapter('arbitrage'),
        new MockEngineRiskAdapter('marl'),
        new MockEngineRiskAdapter('amm'),
        new MockEngineRiskAdapter('alpha-lab'),
      ];
      const synchronizer = new EngineSynchronizer(adapters);
      const breaker = new GlobalCircuitBreaker(100000);

      // Phase 1: Drawdown to 94k (6% DD -> ALERT)
      const alertState = breaker.evaluate(94000);
      expect(alertState.tier).toBe('ALERT');
      await synchronizer.broadcastBreaker(alertState);
      adapters.forEach((a) => expect(a.receivedStates.length).toBe(1));

      // Phase 2: Drawdown to 88k (12% DD -> REDUCE)
      const reduceState = breaker.evaluate(88000);
      expect(reduceState.tier).toBe('REDUCE');
      await synchronizer.broadcastBreaker(reduceState);
      adapters.forEach((a) => expect(a.reductionFactors).toContain(0.50));

      // Phase 3: Severe flash crash to 78k (22% DD -> HARD_STOP)
      const hardStopState = breaker.evaluate(78000);
      expect(hardStopState.tier).toBe('HARD_STOP');
      await synchronizer.broadcastBreaker(hardStopState);
      adapters.forEach((a) => {
        expect(a.isHardStopped).toBe(true);
        expect(a.isHalted).toBe(true);
      });
    });

    it('Scenario 3: Multi-Venue Water-Filling Execution with Provable Price Improvement', () => {
      const books = createMockOrderBooks();
      const optimizer = new WaterFillingOptimizer();
      const verifier = new PriceImprovementVerifier();

      // Parent BUY order of 120 units across multiple books
      const plan = optimizer.optimizeRoute({
        symbol: 'SOL/USDT',
        side: 'BUY',
        targetQuantity: 120,
        maxSlippageBps: 50,
        urgency: 'MEDIUM',
      }, books);

      expect(plan.totalQuantity).toBe(120);
      expect(plan.allocations.length).toBeGreaterThan(1);
      expect(plan.priceImprovementBps).toBeGreaterThanOrEqual(0);

      const naiveSingleVenueCost = plan.totalQuantity * 100.5; // single venue top ask price
      expect(verifier.verify(plan.expectedNetProceedsUsd, naiveSingleVenueCost, 'BUY')).toBe(true);
    });

    it('Scenario 4: Institutional Parent Order Slicing Gauntlet (TWAP, VWAP, Iceberg)', () => {
      const gate = new OrderSplittingGate(5000, 0.15);
      const parentOrderQty = 500;
      const orderValueUsd = parentOrderQty * 100; // $50,000

      // Gate triggers order splitting
      expect(gate.shouldSplit(orderValueUsd, parentOrderQty, 1000)).toBe(true);

      // TWAP slicing with jitter
      const twap = new TwapExecutor();
      const twapSlices = twap.sliceOrder(parentOrderQty, 5, 1000);
      expect(twapSlices.length).toBe(5);
      expect(twapSlices.reduce((a, b) => a + b, 0)).toBeCloseTo(parentOrderQty, 2);

      // VWAP volume adaptation
      const vwap = new VwapExecutor();
      const intradayVolume = [1000, 2500, 5000, 2500, 1000];
      const vwapSlices = vwap.sliceOrder(parentOrderQty, intradayVolume);
      expect(vwapSlices[2]).toBeGreaterThan(vwapSlices[0]);
      expect(vwapSlices.reduce((a, b) => a + b, 0)).toBeCloseTo(parentOrderQty, 2);

      // Iceberg display slicing
      const iceberg = new IcebergExecutor();
      const icebergChunks = iceberg.sliceOrder(parentOrderQty, 0.20);
      expect(icebergChunks.length).toBe(5);
      icebergChunks.forEach((c) => expect(c.visible).toBeLessThanOrEqual(100.01));
    });
  });
}
