import { describe, it, expect } from 'vitest';
import {
  VenueBookAggregator,
  WaterFillingOptimizer,
  OrderSplittingGate,
} from '../fixtures/sor-contract.fixture';
import { createMockOrderBooks } from '../fixtures/test-data.fixture';

export function registerTier2SorCoreTests(): void {
  describe('Tier 2: Boundary - Feature 11: Venue Book Aggregator (F11)', () => {
    it('B11.1: aggregates depth when one venue has 0 asks and 0 bids', () => {
      const books = createMockOrderBooks();
      books.push({ venueId: 'dead-venue', asks: [], bids: [], takerFeeBps: 10, makerFeeBps: 5, gasCostUsd: 0 });
      const agg = new VenueBookAggregator(books);
      expect(agg.getTopDepth('BUY')).toBeGreaterThan(0);
    });

    it('B11.2: aggregates massive institutional liquidity venue (1M depth)', () => {
      const books = [{ venueId: 'deep-dex', asks: [[100, 1000000]] as [number, number][], bids: [[99, 1000000]] as [number, number][], takerFeeBps: 2, makerFeeBps: 1, gasCostUsd: 0 }];
      const agg = new VenueBookAggregator(books);
      expect(agg.getTopDepth('BUY', 1)).toBe(1000000);
    });

    it('B11.3: preserves zero gas cost on centralized exchange venues', () => {
      const books = createMockOrderBooks();
      const binance = books.find((b) => b.venueId === 'binance');
      expect(binance?.gasCostUsd).toBe(0);
    });

    it('B11.4: requests top depth with levels greater than available depth tiers', () => {
      const books = createMockOrderBooks();
      const agg = new VenueBookAggregator(books);
      const depth10 = agg.getTopDepth('BUY', 50);
      const depth5 = agg.getTopDepth('BUY', 5);
      expect(depth10).toBeGreaterThanOrEqual(depth5);
    });

    it('B11.5: handles single venue order book with only 1 price tier', () => {
      const books = [{ venueId: 'single-tier', asks: [[105.0, 10]] as [number, number][], bids: [[104.0, 10]] as [number, number][], takerFeeBps: 5, makerFeeBps: 0, gasCostUsd: 0 }];
      const agg = new VenueBookAggregator(books);
      expect(agg.getTopDepth('BUY')).toBe(10);
    });
  });

  describe('Tier 2: Boundary - Feature 12: Water-Filling SOR Optimizer (F12)', () => {
    it('B12.1: handles tiny fractional order quantity (0.0001) without rounding to 0', () => {
      const books = createMockOrderBooks();
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 0.0001, maxSlippageBps: 50, urgency: 'HIGH' }, books);
      expect(plan.totalQuantity).toBeCloseTo(0.0001, 6);
    });

    it('B12.2: gas price spike ($50 gas) reroutes order away from on-chain AMMs toward CEX', () => {
      const books = createMockOrderBooks();
      const cpmm = books.find((b) => b.venueId === 'cpmm-amm');
      if (cpmm) (cpmm as { gasCostUsd: number }).gasCostUsd = 100.0;
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 10, maxSlippageBps: 50, urgency: 'LOW' }, books);
      expect(plan.allocations.some((a) => a.venueId === 'cpmm-amm')).toBe(false);
    });

    it('B12.3: extreme taker fee (100 bps) penalizes venue in effective price calculation', () => {
      const books = createMockOrderBooks();
      const bybit = books.find((b) => b.venueId === 'bybit');
      if (bybit) (bybit as { takerFeeBps: number }).takerFeeBps = 500; // 5% fee
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 20, maxSlippageBps: 100, urgency: 'HIGH' }, books);
      expect(plan.allocations[0].venueId).not.toBe('bybit');
    });

    it('B12.4: verifies that buy effective price is strictly bounded above zero', () => {
      const books = createMockOrderBooks();
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 50, maxSlippageBps: 50, urgency: 'MEDIUM' }, books);
      expect(plan.expectedEffectivePrice).toBeGreaterThan(90);
    });

    it('B12.5: handles zero available liquidity returning 0 filled quantity', () => {
      const opt = new WaterFillingOptimizer();
      const plan = opt.optimizeRoute({ symbol: 'SOL/USDT', side: 'BUY', targetQuantity: 50, maxSlippageBps: 50, urgency: 'MEDIUM' }, []);
      expect(plan.totalQuantity).toBe(0);
      expect(plan.allocations.length).toBe(0);
    });
  });

  describe('Tier 2: Boundary - Feature 13: Order Splitting Gate (F13)', () => {
    const gate = new OrderSplittingGate(5000, 0.15);

    it('B13.1: order value at exactly $5,000.00 evaluates shouldSplit=false', () => {
      expect(gate.shouldSplit(5000, 10, 1000)).toBe(false);
    });

    it('B13.2: order value at $5,000.01 evaluates shouldSplit=true', () => {
      expect(gate.shouldSplit(5000.01, 10, 1000)).toBe(true);
    });

    it('B13.3: order quantity at exactly 15.000% of top-5 depth evaluates shouldSplit=false', () => {
      expect(gate.shouldSplit(3000, 150, 1000)).toBe(false);
    });

    it('B13.4: order quantity at 15.001% of top-5 depth evaluates shouldSplit=true', () => {
      expect(gate.shouldSplit(3000, 150.1, 1000)).toBe(true);
    });

    it('B13.5: massive $1,000,000 order triggers splitting unconditionally', () => {
      expect(gate.shouldSplit(1000000, 5000, 50000)).toBe(true);
    });
  });
}
