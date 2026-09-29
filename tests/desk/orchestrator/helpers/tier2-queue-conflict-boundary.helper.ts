/**
 * Tier 2: Queue & Conflict Resolution Boundary Helper
 * Saturation, edge values, expiry limits, micro-quantities (12 tests)
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAlphaLabIntent,
  calculateMockPriority,
} from '../fixtures/mock-engines.fixture';
import {
  MockPriorityQueue,
  MockConflictResolver,
} from '../fixtures/mock-queue-resolver.fixture';

export function registerTier2QueueConflictBoundaryTests(): void {
  describe('Queue Boundary & Saturation Conditions', () => {
    it('B1: Enqueues exactly 50 items without triggering any shedding', () => {
      const q = new MockPriorityQueue(50);
      for (let i = 0; i < 50; i++) {
        q.enqueue(createAlphaLabIntent({ intentId: `alpha-${i}`, urgency: 'LOW' }));
      }
      expect(q.size()).toBe(50);
      expect(q.getStatus().shedCount).toBe(0);
    });

    it('B2: Item 51 triggers exactly 1 shed eviction when incoming item has higher priority', () => {
      const q = new MockPriorityQueue(50);
      for (let i = 0; i < 50; i++) {
        q.enqueue(createAlphaLabIntent({ intentId: `alpha-${i}`, urgency: 'LOW' }));
      }
      const high = createArbitrageIntent({ intentId: 'arb-51', urgency: 'HIGH' });
      const accepted = q.enqueue(high);

      expect(accepted).toBe(true);
      expect(q.size()).toBe(50);
      expect(q.getStatus().shedCount).toBe(1);
      expect(q.peek()?.intentId).toBe('arb-51');
    });

    it('B3: Incoming low-priority item is dropped when queue has 50 protected items', () => {
      const q = new MockPriorityQueue(50);
      for (let i = 0; i < 50; i++) {
        q.enqueue(createMarlIntent({ intentId: `hedge-${i}`, isRiskReducing: true }));
      }
      const low = createAlphaLabIntent({ intentId: 'spec-incoming', isRiskReducing: false, urgency: 'LOW' });
      const accepted = q.enqueue(low);

      expect(accepted).toBe(false);
      expect(q.size()).toBe(50);
      expect(q.getStatus().shedCount).toBe(1);
    });

    it('B4: Burst of 100 items into 50-capacity queue maintains strictly 50 items', () => {
      const q = new MockPriorityQueue(50);
      for (let i = 0; i < 100; i++) {
        q.enqueue(
          createAlphaLabIntent({
            intentId: `burst-${i}`,
            expectedEdgeBps: i,
            urgency: i % 2 === 0 ? 'HIGH' : 'LOW',
          })
        );
      }
      expect(q.size()).toBe(50);
      expect(q.getStatus().shedCount).toBe(50);
    });

    it('B5: Zero edge (0 bps) vs extreme edge (10000 bps) priority score bounding', () => {
      const zeroEdge = createArbitrageIntent({ expectedEdgeBps: 0 });
      const extremeEdge = createArbitrageIntent({ expectedEdgeBps: 10000 });

      const pZero = calculateMockPriority(zeroEdge);
      const pExtreme = calculateMockPriority(extremeEdge);

      expect(pZero.edgeScore).toBe(0);
      expect(pExtreme.edgeScore).toBe(50); // Capped at 50
    });

    it('B6: Imminent expiry boundary (0ms vs 1ms vs distant)', () => {
      const now = Date.now();
      const expired = createArbitrageIntent({ timeToExpiryMs: 0, expiresAt: now });
      const imminent = createArbitrageIntent({ timeToExpiryMs: 1, expiresAt: now + 1 });
      const distant = createArbitrageIntent({ timeToExpiryMs: 86400000, expiresAt: now + 86400000 });

      const pExp = calculateMockPriority(expired, now);
      const pImm = calculateMockPriority(imminent, now);
      const pDist = calculateMockPriority(distant, now);

      expect(pExp.expiryScore).toBe(50);
      expect(pImm.expiryScore).toBeCloseTo(50, 0);
      expect(pDist.expiryScore).toBeCloseTo(0, 0);
    });

    it('B7: Deterministic tie-breaking preserves stability when composite scores are equal', () => {
      const q = new MockPriorityQueue(10);
      const item1 = createArbitrageIntent({ intentId: 'tie-1', urgency: 'HIGH', expectedEdgeBps: 30 });
      const item2 = createArbitrageIntent({ intentId: 'tie-2', urgency: 'HIGH', expectedEdgeBps: 30 });

      q.enqueue(item1);
      q.enqueue(item2);

      expect(q.dequeue()?.intentId).toBe('tie-1');
      expect(q.dequeue()?.intentId).toBe('tie-2');
    });
  });

  describe('Conflict Resolution Boundary Conditions', () => {
    it('B8: Internal crossing with micro-quantity (1e-6) maintains precision', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ quantity: 1e-6, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 1e-6, side: 'SELL' });
      const res = resolver.resolveTier1Crossing(buy, sell, 65000);

      expect(res.matchedQuantity).toBe(1e-6);
      expect(res.syntheticFills[0].quantity).toBe(1e-6);
      expect(res.residualIntents.length).toBe(0);
    });

    it('B9: Internal crossing with unequal micro-quantities yields exact micro-residual', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ quantity: 0.000005, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 0.000003, side: 'SELL' });
      const res = resolver.resolveTier1Crossing(buy, sell, 65000);

      expect(res.matchedQuantity).toBe(0.000003);
      expect(res.residualIntents[0].quantity).toBeCloseTo(0.000002, 8);
    });

    it('B10: Tier 2 risk supremacy when both intents have isRiskReducing: true returns NO_CONFLICT', () => {
      const resolver = new MockConflictResolver();
      const hedge1 = createMarlIntent({ isRiskReducing: true, side: 'BUY' });
      const hedge2 = createMarlIntent({ isRiskReducing: true, side: 'SELL' });
      const res = resolver.resolveTier2RiskSupremacy(hedge1, hedge2);

      expect(res.resolutionType).toBe('NO_CONFLICT');
      expect(res.residualIntents.length).toBe(2);
    });

    it('B11: Tier 3 conviction arbitration with zero weight resolves deterministically', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ side: 'BUY', expectedEdgeBps: 50, expectedSharpe: 2.0 });
      const sell = createMarlIntent({ side: 'SELL', expectedEdgeBps: 50, expectedSharpe: 2.0 });
      const weights = { arbitrage: 0.5, marl: 0.0, amm: 0.5, 'alpha-lab': 0.0 };

      const res = resolver.resolveTier3Conviction(buy, sell, weights);
      expect(res.resolutionType).toBe('TIER_3_PORTFOLIO_CONVICTION');
      expect(res.residualIntents.length).toBe(1);
    });

    it('B12: Empty intent list in conflict detector produces zero pairs', () => {
      const resolver = new MockConflictResolver();
      expect(resolver.detectConflicts([])).toEqual([]);
    });
  });
}
