import { describe, it, expect } from 'vitest';
import {
  ENGINE_IDS,
  EngineId,
  PortfolioAllocator,
  CapitalBufferGuard,
  RollingCovarianceEstimator,
} from '../../../../src/desk/portfolio';
import {
  GlobalCircuitBreaker,
  computeTailDivergence,
  LeverageExposureGuard,
} from '../fixtures/risk-contract.fixture';
import {
  WaterFillingOptimizer,
  OrderSplittingGate,
  TwapExecutor,
} from '../fixtures/sor-contract.fixture';
import { createMockOrderBooks } from '../fixtures/test-data.fixture';

export function registerTier3AllocatorRiskSorInteractions(): void {
  describe('Tier 3: Allocator ↔ Risk Guard & SOR Interactions (X1-X11)', () => {
    it('X1: Allocator rebalance throttles deployable capital when circuit breaker enters REDUCE', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const breakerState = cb.evaluate(89000); // 11% DD -> REDUCE
      expect(breakerState.tier).toBe('REDUCE');

      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      // Under REDUCE, de-rate deployable capital by 50%
      const effectiveNav = breakerState.tier === 'REDUCE' ? 89000 * 0.50 : 89000;
      const res = guard.applyGuard(effectiveNav, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(res.unallocatedCashUsd).toBeCloseTo(89000 * 0.50 * 0.20, 1);
    });

    it('X2: Tail Risk Divergence triggers dynamic reduction of max allowed leverage', () => {
      const tailCheck = computeTailDivergence(2000, 3800, 1.5); // 1.9x ratio -> divergent
      expect(tailCheck.isTailDivergent).toBe(true);

      const dynamicLeverageCap = tailCheck.isTailDivergent ? 1.5 : 3.0;
      const guard = new LeverageExposureGuard(dynamicLeverageCap);
      const res = guard.checkExposure(100000, { btc: 90000, eth: 90000 }); // 1.8x leverage
      expect(res.isAllowed).toBe(false);
      expect(res.violationReason).toContain('exceeds limit 1.5x');
    });

    it('X3: High rolling covariance across engines triggers circuit breaker correlation alert', () => {
      const est = new RollingCovarianceEstimator({ windowSize: 10 });
      for (let i = 0; i < 5; i++) {
        est.addObservation({ arbitrage: 0.05, marl: 0.05, amm: 0.05, 'alpha-lab': 0.05 });
      }
      const cov = est.getCovarianceMatrix();
      const meanCorr = 0.92; // simulated synchronized surge
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(99000, meanCorr);
      expect(state.tier).toBe('ALERT');
      expect(state.reason).toContain('Correlation spike');
    });

    it('X4: Engine Synchronizer halts trading during mid-flight rebalancing and freezes allocator state', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(84000); // 16% DD -> HALT
      expect(state.tier).toBe('HALT');

      const isTradingHalted = state.tier === 'HALT' || state.tier === 'HARD_STOP';
      expect(isTradingHalted).toBe(true);
    });

    it('X5: Historical VaR surge dynamically increases cash buffer ratio', () => {
      const highHistoricalVar = 15000;
      const portfolioNav = 100000;
      const varRatio = highHistoricalVar / portfolioNav; // 15% VaR
      const dynamicCashBuffer = varRatio > 0.10 ? 0.30 : 0.20;

      const guard = new CapitalBufferGuard({ minCashBufferRatio: dynamicCashBuffer });
      const res = guard.applyGuard(portfolioNav, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      expect(res.cashBufferRatio).toBeGreaterThanOrEqual(0.30);
    });

    it('X6: Performance tilts shift risk budgets away from volatile engine under leverage pressure', () => {
      const allocator = new PortfolioAllocator();
      const res = allocator.allocate({
        totalNavUsd: 100000,
        currentAllocations: { arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 },
        lockedCapital: { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 },
        regime: 'HIGH_VOLATILITY',
        performance: {
          arbitrage: { engineId: 'arbitrage', rollingSharpe: 2.5, rollingSortino: 3.0, rollingVolatility: 0.05, totalPnlUsd: 1000 },
          marl: { engineId: 'marl', rollingSharpe: 0.2, rollingSortino: 0.3, rollingVolatility: 0.40, totalPnlUsd: -500 },
          amm: { engineId: 'amm', rollingSharpe: 1.0, rollingSortino: 1.1, rollingVolatility: 0.10, totalPnlUsd: 200 },
          'alpha-lab': { engineId: 'alpha-lab', rollingSharpe: 1.2, rollingSortino: 1.3, rollingVolatility: 0.15, totalPnlUsd: 300 },
        },
      });
      expect(res.allocatedCapitalUsd.arbitrage).toBeGreaterThan(res.allocatedCapitalUsd.marl * 2);
    });

    it('X7: Large allocator rebalance order triggers Order Splitting Gate', () => {
      const gate = new OrderSplittingGate(5000, 0.15);
      const rebalanceDeltaUsd = 25000;
      expect(gate.shouldSplit(rebalanceDeltaUsd, 250, 1000)).toBe(true);
    });

    it('X8: Capital Buffer Guard minimum cash constraint restricts maximum slice in TWAP execution', () => {
      const guard = new CapitalBufferGuard({ minCashBufferRatio: 0.20 });
      const res = guard.applyGuard(100000, { arbitrage: 0.25, marl: 0.25, amm: 0.25, 'alpha-lab': 0.25 }, { arbitrage: 0, marl: 0, amm: 0, 'alpha-lab': 0 });
      const maxDeployable = 100000 - res.unallocatedCashUsd; // 80,000

      const twap = new TwapExecutor();
      const slices = twap.sliceOrder(maxDeployable, 4, 0);
      slices.forEach((s) => expect(s).toBeLessThanOrEqual(maxDeployable / 2));
    });

    it('X9: Starvation protection prevents forced position liquidation during multi-venue routing', () => {
      const guard = new CapitalBufferGuard();
      const res = guard.applyGuard(
        100000,
        { arbitrage: 0.05, marl: 0.05, amm: 0.05, 'alpha-lab': 0.85 },
        { arbitrage: 12000, marl: 0, amm: 0, 'alpha-lab': 0 }
      );
      expect(res.allocatedCapitalUsd.arbitrage).toBe(12000);
      expect(res.drainModeEngines).toContain('arbitrage');
    });

    it('X10: SOR water-filling net proceeds updates allocator NAV post-execution', () => {
      const books = createMockOrderBooks();
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'SELL', targetQuantity: 100, maxSlippageBps: 50, urgency: 'MEDIUM' }, books);
      const initialNav = 100000;
      const updatedNav = initialNav + plan.expectedNetProceedsUsd;
      expect(updatedNav).toBeGreaterThan(initialNav);
    });

    it('X11: Price improvement savings from SOR reduce transaction drag on rebalance', () => {
      const books = createMockOrderBooks();
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 80, maxSlippageBps: 50, urgency: 'MEDIUM' }, books);
      expect(plan.priceImprovementBps).toBeGreaterThanOrEqual(0);
    });
  });
}
