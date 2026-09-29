/**
 * Tier 1: Queue Backpressure & Conflict Resolution (F3, F4, F5)
 * Shedding, opposing conflict detection, and 3-Tier resolution (15 tests).
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAmmIntent,
  createAlphaLabIntent,
} from '../fixtures/mock-engines.fixture';
import {
  MockPriorityQueue,
  MockConflictResolver,
} from '../fixtures/mock-queue-resolver.fixture';

export function registerTier1QueueConflictTests(): void {
  describe('F3: Backpressure Queue Shedding', () => {
    it('T3.1: Enqueues up to capacity without eviction', () => {
      const q = new MockPriorityQueue(10);
      for (let i = 0; i < 10; i++) {
        q.enqueue(createAlphaLabIntent({ intentId: `alpha-${i}` }));
      }
      expect(q.size()).toBe(10);
      expect(q.getStatus().shedCount).toBe(0);
    });

    it('T3.2: Evicts lowest-priority intent when capacity is breached', () => {
      const q = new MockPriorityQueue(5);
      for (let i = 0; i < 5; i++) {
        q.enqueue(createAlphaLabIntent({ intentId: `low-${i}`, urgency: 'LOW' }));
      }
      const high = createArbitrageIntent({ intentId: 'high-urgent', urgency: 'HIGH' });
      q.enqueue(high);
      expect(q.size()).toBe(5);
      expect(q.getStatus().shedCount).toBe(1);
      expect(q.peek()?.intentId).toBe('high-urgent');
    });

    it('T3.3: Strictly protects risk-reducing intents from eviction', () => {
      const q = new MockPriorityQueue(3);
      q.enqueue(createMarlIntent({ intentId: 'hedge-1', isRiskReducing: true }));
      q.enqueue(createMarlIntent({ intentId: 'hedge-2', isRiskReducing: true }));
      q.enqueue(createAlphaLabIntent({ intentId: 'spec-1', isRiskReducing: false, urgency: 'LOW' }));

      q.enqueue(createArbitrageIntent({ intentId: 'arb-incoming', urgency: 'HIGH' }));
      const remainingIds = q.getAll().map((i) => i.intentId);
      expect(remainingIds).toContain('hedge-1');
      expect(remainingIds).toContain('hedge-2');
      expect(remainingIds).not.toContain('spec-1');
    });

    it('T3.4: Strictly protects HIGH urgency intents from eviction', () => {
      const q = new MockPriorityQueue(2);
      q.enqueue(createArbitrageIntent({ intentId: 'arb-high', urgency: 'HIGH' }));
      q.enqueue(createAlphaLabIntent({ intentId: 'alpha-low', urgency: 'LOW' }));

      q.enqueue(createAmmIntent({ intentId: 'amm-med', urgency: 'MEDIUM' }));
      const remainingIds = q.getAll().map((i) => i.intentId);
      expect(remainingIds).toContain('arb-high');
      expect(remainingIds).not.toContain('alpha-low');
    });

    it('T3.5: Tracks shed count and reflects in getStatus()', () => {
      const q = new MockPriorityQueue(2);
      q.enqueue(createAlphaLabIntent({ intentId: 'item-1', urgency: 'LOW' }));
      q.enqueue(createAlphaLabIntent({ intentId: 'item-2', urgency: 'LOW' }));
      q.enqueue(createArbitrageIntent({ intentId: 'item-3', urgency: 'HIGH' }));
      q.enqueue(createArbitrageIntent({ intentId: 'item-4', urgency: 'HIGH' }));

      const status = q.getStatus();
      expect(status.shedCount).toBe(2);
      expect(status.depth).toBe(2);
    });
  });

  describe('F4: Opposing Intent Conflict Detector', () => {
    it('T4.1: Detects opposing BUY and SELL on identical symbol', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ symbol: 'BTC/USDT', side: 'BUY' });
      const sell = createMarlIntent({ symbol: 'BTC/USDT', side: 'SELL' });
      const pairs = resolver.detectConflicts([buy, sell]);
      expect(pairs.length).toBe(1);
      expect(pairs[0][0].side).toBe('BUY');
      expect(pairs[0][1].side).toBe('SELL');
    });

    it('T4.2: Ignores non-opposing intents (BUY and BUY) on identical symbol', () => {
      const resolver = new MockConflictResolver();
      const buy1 = createAlphaLabIntent({ symbol: 'BTC/USDT', side: 'BUY' });
      const buy2 = createArbitrageIntent({ symbol: 'BTC/USDT', side: 'BUY' });
      expect(resolver.detectConflicts([buy1, buy2]).length).toBe(0);
    });

    it('T4.3: Ignores opposing intents on different symbols', () => {
      const resolver = new MockConflictResolver();
      const buyBtc = createAlphaLabIntent({ symbol: 'BTC/USDT', side: 'BUY' });
      const sellEth = createMarlIntent({ symbol: 'ETH/USDT', side: 'SELL' });
      expect(resolver.detectConflicts([buyBtc, sellEth]).length).toBe(0);
    });

    it('T4.4: Detects cross-engine opposing intents (Alpha-Lab BUY vs MARL SELL)', () => {
      const resolver = new MockConflictResolver();
      const alpha = createAlphaLabIntent({ symbol: 'SOL/USDT', side: 'BUY' });
      const marl = createMarlIntent({ symbol: 'SOL/USDT', side: 'SELL' });
      const conflicts = resolver.detectConflicts([alpha, marl]);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0][0].engineId).toBe('alpha-lab');
      expect(conflicts[0][1].engineId).toBe('marl');
    });

    it('T4.5: Returns empty pairs when queue has no conflicts', () => {
      const resolver = new MockConflictResolver();
      expect(resolver.detectConflicts([createAlphaLabIntent({ symbol: 'BTC/USDT', side: 'BUY' })])).toEqual([]);
    });
  });

  describe('F5: 3-Tier Conflict Resolution Engine', () => {
    it('T5.1: Tier 1 matches equal quantities at mid-market with 0 fee and 0 slippage', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ quantity: 1.0, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 1.0, side: 'SELL' });
      const res = resolver.resolveTier1Crossing(buy, sell, 65000);

      expect(res.resolutionType).toBe('TIER_1_CROSS');
      expect(res.matchedQuantity).toBe(1.0);
      expect(res.syntheticFills.length).toBe(2);
      expect(res.syntheticFills[0].fee).toBe(0);
      expect(res.syntheticFills[0].slippage).toBe(0);
      expect(res.residualIntents.length).toBe(0);
    });

    it('T5.2: Tier 1 returns residual intent for unequal quantities', () => {
      const resolver = new MockConflictResolver();
      const buy = createAlphaLabIntent({ quantity: 2.5, side: 'BUY' });
      const sell = createMarlIntent({ quantity: 1.0, side: 'SELL' });
      const res = resolver.resolveTier1Crossing(buy, sell, 65000);

      expect(res.matchedQuantity).toBe(1.0);
      expect(res.residualIntents.length).toBe(1);
      expect(res.residualIntents[0].quantity).toBe(1.5);
    });

    it('T5.3: Tier 2 risk-reducing intent strictly overrides speculative intent', () => {
      const resolver = new MockConflictResolver();
      const hedge = createMarlIntent({ isRiskReducing: true, side: 'SELL' });
      const spec = createAlphaLabIntent({ isRiskReducing: false, side: 'BUY' });
      const res = resolver.resolveTier2RiskSupremacy(spec, hedge);

      expect(res.resolutionType).toBe('TIER_2_RISK_SUPREMACY');
      expect(res.residualIntents[0].intentId).toBe(hedge.intentId);
      expect(res.rejectedIntents[0].intentId).toBe(spec.intentId);
    });

    it('T5.4: Tier 3 arbitrates between speculative intents using portfolio weights and conviction', () => {
      const resolver = new MockConflictResolver();
      const alpha = createAlphaLabIntent({ side: 'BUY', expectedEdgeBps: 80, expectedSharpe: 2.5 });
      const marl = createMarlIntent({ side: 'SELL', expectedEdgeBps: 20, expectedSharpe: 1.0 });
      const weights = { arbitrage: 0.25, marl: 0.15, amm: 0.25, 'alpha-lab': 0.35 };

      const res = resolver.resolveTier3Conviction(alpha, marl, weights);
      expect(res.resolutionType).toBe('TIER_3_PORTFOLIO_CONVICTION');
      expect(res.residualIntents[0].intentId).toBe(alpha.intentId);
      expect(res.rejectedIntents[0].intentId).toBe(marl.intentId);
    });

    it('T5.5: Tier 3 rejects lower conviction intent with explicit diagnostic reason', () => {
      const resolver = new MockConflictResolver();
      const alpha = createAlphaLabIntent({ side: 'BUY', expectedEdgeBps: 80, expectedSharpe: 2.5 });
      const marl = createMarlIntent({ side: 'SELL', expectedEdgeBps: 10, expectedSharpe: 0.5 });
      const weights = { arbitrage: 0.25, marl: 0.1, amm: 0.25, 'alpha-lab': 0.4 };

      const res = resolver.resolveTier3Conviction(alpha, marl, weights);
      expect(res.rejectedIntents[0].reason).toContain('Arbitrated by portfolio weight conviction');
    });
  });
}
