import { describe, it, expect } from 'vitest';
import {
  ENGINE_IDS,
  RollingCovarianceEstimator,
  ErcParitySolver,
  solveErcCcd,
} from '../../../../src/desk/portfolio';
import {
  GlobalCircuitBreaker,
  EngineSynchronizer,
} from '../fixtures/risk-contract.fixture';
import {
  WaterFillingOptimizer,
  OrderSplittingGate,
} from '../fixtures/sor-contract.fixture';
import {
  createMockOrderBooks,
  MockEngineRiskAdapter,
} from '../fixtures/test-data.fixture';

export function registerTier5AdversarialMathTests(): void {
  describe('Tier 5: Adversarial Hardening - Mathematical & Execution Stress (ADV-1 to ADV-10)', () => {
    it('ADV-1: Degenerate covariance matrix with all zeros handled with ridge stabilization', () => {
      const zeroSigma = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      const res = solveErcCcd(zeroSigma, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);
      expect(Number.isFinite(res.weights[0])).toBe(true);
      expect(res.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0, 4);
    });

    it('ADV-2: Ill-conditioned nearly singular matrix handled without divergence', () => {
      const illConditioned = [
        [1.0, 0.99999, 0.99999, 0.99999],
        [0.99999, 1.0, 0.99999, 0.99999],
        [0.99999, 0.99999, 1.0, 0.99999],
        [0.99999, 0.99999, 0.99999, 1.0],
      ];
      const solver = new ErcParitySolver({ maxIterations: 30 });
      const cov = { engines: [...ENGINE_IDS], matrix: illConditioned, observations: 20, lastUpdated: 0, isConditioned: true };
      const res = solver.solve(cov);
      expect(Number.isFinite(res.portfolioVolatility)).toBe(true);
      expect(res.weights.arbitrage).toBeGreaterThan(0);
    });

    it('ADV-3: Indefinite covariance matrix with negative off-diagonals produces valid weights', () => {
      const indefinite = [
        [0.04, -0.035, 0, 0],
        [-0.035, 0.04, 0, 0],
        [0, 0, 0.04, 0.01],
        [0, 0, 0.01, 0.04],
      ];
      const res = solveErcCcd(indefinite, [0.25, 0.25, 0.25, 0.25], 1e-4, 25);
      expect(res.weights.every((w) => Number.isFinite(w) && w > 0)).toBe(true);
    });

    it('ADV-4: Rolling covariance sanitizes extreme NaN and +/- Infinity return inputs', () => {
      const est = new RollingCovarianceEstimator();
      est.addObservation({ arbitrage: NaN, marl: Infinity, amm: -Infinity, 'alpha-lab': 0.01 });
      const cov = est.getCovarianceMatrix();
      for (const row of cov.matrix) {
        for (const val of row) {
          expect(Number.isFinite(val)).toBe(true);
        }
      }
    });

    it('ADV-5: Multi-asset flash crash cascade (-40% simultaneous) triggers immediate HARD_STOP', async () => {
      const breaker = new GlobalCircuitBreaker(100000);
      const state = breaker.evaluate(60000); // 40% crash
      expect(state.tier).toBe('HARD_STOP');

      const adapter = new MockEngineRiskAdapter('arbitrage');
      const sync = new EngineSynchronizer([adapter]);
      await sync.broadcastBreaker(state);
      expect(adapter.isHardStopped).toBe(true);
    });

    it('ADV-6: 100x gas price spike ($500 per tx) excludes deceptive cheap on-chain AMMs', () => {
      const books = createMockOrderBooks();
      const cpmm = books.find((b) => b.venueId === 'cpmm-amm');
      if (cpmm) {
        (cpmm as { asks: [number, number][] }).asks = [[90.0, 50]]; // deceptively cheap price
        (cpmm as { gasCostUsd: number }).gasCostUsd = 500.0; // massive gas hurdle
      }
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 1, maxSlippageBps: 100, urgency: 'LOW' }, books);
      // For 1 unit, $500 gas makes CPMM effective price $590 vs CEX ~$100
      expect(plan.allocations[0].venueId).not.toBe('cpmm-amm');
    });

    it('ADV-7: Crossed order books (arbitrage inverted spread) captured by router', () => {
      const crossedBooks = [
        { venueId: 'venueA', asks: [[98.0, 10]] as [number, number][], bids: [[97.0, 10]] as [number, number][], takerFeeBps: 0, makerFeeBps: 0, gasCostUsd: 0 },
        { venueId: 'venueB', asks: [[101.0, 10]] as [number, number][], bids: [[102.0, 10]] as [number, number][], takerFeeBps: 0, makerFeeBps: 0, gasCostUsd: 0 },
      ];
      const opt = new WaterFillingOptimizer();
      const buyPlan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 10, maxSlippageBps: 50, urgency: 'HIGH' }, crossedBooks);
      expect(buyPlan.allocations[0].venueId).toBe('venueA');
      expect(buyPlan.expectedEffectivePrice).toBe(98.0);
    });

    it('ADV-8: Zero-liquidity desert across all venues returns empty route gracefully', () => {
      const emptyBooks = [{ venueId: 'ghost', asks: [], bids: [], takerFeeBps: 10, makerFeeBps: 5, gasCostUsd: 0 }];
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 100, maxSlippageBps: 50, urgency: 'MEDIUM' }, emptyBooks);
      expect(plan.totalQuantity).toBe(0);
      expect(plan.allocations.length).toBe(0);
    });

    it('ADV-9: Ghost liquidity: quantity exceeding aggregate depth returns partial fill safely', () => {
      const books = createMockOrderBooks();
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 1000000, maxSlippageBps: 500, urgency: 'HIGH' }, books);
      expect(plan.totalQuantity).toBeGreaterThan(0);
      expect(plan.totalQuantity).toBeLessThan(1000000);
    });

    it('ADV-10: Massive $100M parent order triggers splitting and caps execution risk', () => {
      const gate = new OrderSplittingGate(5000, 0.15);
      const massiveOrderValue = 100000000;
      expect(gate.shouldSplit(massiveOrderValue, 1000000, 10000)).toBe(true);
    });
  });
}
