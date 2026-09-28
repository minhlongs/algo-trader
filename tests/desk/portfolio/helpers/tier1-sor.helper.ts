import { describe, it, expect } from 'vitest';
import {
  VenueBookAggregator,
  WaterFillingOptimizer,
  OrderSplittingGate,
} from '../fixtures/sor-contract.fixture';
import { createMockOrderBooks } from '../fixtures/test-data.fixture';

export function registerTier1SorCoreTests(): void {
  describe('Feature 11: Venue Book Aggregator (F11)', () => {
    it('F11.1: ingests multi-venue order books across CEX, CLOB, and AMMs', () => {
      const books = createMockOrderBooks();
      const aggregator = new VenueBookAggregator(books);
      expect(aggregator.getBooks().length).toBe(4);
    });

    it('F11.2: aggregates top-5 depth across all venues for BUY side', () => {
      const books = createMockOrderBooks();
      const aggregator = new VenueBookAggregator(books);
      const depth = aggregator.getTopDepth('BUY', 5);
      expect(depth).toBeGreaterThan(500);
    });

    it('F11.3: aggregates top-5 depth across all venues for SELL side', () => {
      const books = createMockOrderBooks();
      const aggregator = new VenueBookAggregator(books);
      const depth = aggregator.getTopDepth('SELL', 5);
      expect(depth).toBeGreaterThan(500);
    });

    it('F11.4: preserves venue fee and gas parameters in aggregated books', () => {
      const books = createMockOrderBooks();
      const aggregator = new VenueBookAggregator(books);
      const bybit = aggregator.getBooks().find((b) => b.venueId === 'bybit');
      expect(bybit?.takerFeeBps).toBe(6);
    });

    it('F11.5: handles empty venue books returning zero depth', () => {
      const aggregator = new VenueBookAggregator([]);
      expect(aggregator.getTopDepth('BUY')).toBe(0);
    });
  });

  describe('Feature 12: Water-Filling SOR Optimizer (F12)', () => {
    it('F12.1: allocates target quantity across venues to minimize net cost', () => {
      const books = createMockOrderBooks();
      const optimizer = new WaterFillingOptimizer();
      const plan = optimizer.optimizeRoute({
        symbol: 'SOL/USDT',
        side: 'BUY',
        targetQuantity: 100,
        maxSlippageBps: 50,
        urgency: 'MEDIUM',
      }, books);
      expect(plan.totalQuantity).toBe(100);
      expect(plan.allocations.length).toBeGreaterThan(1);
    });

    it('F12.2: factors taker fees into marginal cost sorting', () => {
      const books = createMockOrderBooks();
      const optimizer = new WaterFillingOptimizer();
      const plan = optimizer.optimizeRoute({
        symbol: 'SOL/USDT',
        side: 'BUY',
        targetQuantity: 30,
        maxSlippageBps: 50,
        urgency: 'HIGH',
      }, books);
      // Bybit has lowest ask (99.9) and low fee (6 bps)
      expect(plan.allocations[0].venueId).toBe('bybit');
    });

    it('F12.3: charges on-chain gas costs once per venue allocated', () => {
      const books = createMockOrderBooks();
      const optimizer = new WaterFillingOptimizer();
      const plan = optimizer.optimizeRoute({
        symbol: 'SOL/USDT',
        side: 'BUY',
        targetQuantity: 200,
        maxSlippageBps: 100,
        urgency: 'LOW',
      }, books);
      expect(plan.expectedGasCostUsd).toBeGreaterThan(0);
    });

    it('F12.4: computes expected net proceeds and effective price accurately', () => {
      const books = createMockOrderBooks();
      const optimizer = new WaterFillingOptimizer();
      const plan = optimizer.optimizeRoute({
        symbol: 'SOL/USDT',
        side: 'SELL',
        targetQuantity: 50,
        maxSlippageBps: 50,
        urgency: 'MEDIUM',
      }, books);
      expect(plan.expectedEffectivePrice).toBeGreaterThan(99.0);
      expect(plan.expectedNetProceedsUsd).toBeLessThan(plan.totalQuantity * plan.expectedEffectivePrice);
    });

    it('F12.5: handles partial fill when target quantity exceeds all books depth', () => {
      const books = createMockOrderBooks();
      const optimizer = new WaterFillingOptimizer();
      const plan = optimizer.optimizeRoute({
        symbol: 'SOL/USDT',
        side: 'BUY',
        targetQuantity: 10000,
        maxSlippageBps: 200,
        urgency: 'HIGH',
      }, books);
      expect(plan.totalQuantity).toBeLessThan(10000);
    });
  });

  describe('Feature 13: Order Splitting Gate (F13)', () => {
    const gate = new OrderSplittingGate(5000, 0.15);

    it('F13.1: triggers splitting when order value exceeds $5,000 threshold', () => {
      expect(gate.shouldSplit(6000, 10, 1000)).toBe(true);
    });

    it('F13.2: does not trigger splitting for small orders (< $5,000 and <= 15% depth)', () => {
      expect(gate.shouldSplit(2000, 20, 1000)).toBe(false);
    });

    it('F13.3: triggers splitting when order quantity exceeds 15% of top-5 depth', () => {
      expect(gate.shouldSplit(3000, 200, 1000)).toBe(true);
    });

    it('F13.4: handles zero top-5 depth without NaN or crash', () => {
      expect(gate.shouldSplit(1000, 10, 0)).toBe(false);
    });

    it('F13.5: triggers splitting when both dollar value and depth thresholds are exceeded', () => {
      expect(gate.shouldSplit(10000, 250, 1000)).toBe(true);
    });
  });
}
