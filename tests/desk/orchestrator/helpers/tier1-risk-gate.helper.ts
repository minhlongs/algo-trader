/**
 * Tier 1: Pre-Trade Risk Gate & Circuit Breaker Helper (F8 - F9)
 * Covers R2 circuit breaker and concentration requirements in isolation (10 tests).
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAlphaLabIntent,
} from '../fixtures/mock-engines.fixture';
import { MockSynchronizedRiskGate } from '../fixtures/mock-risk-gate.fixture';

export function registerTier1RiskGateTests(): void {
  describe('F8: Synchronized Circuit Breaker Gate', () => {
    it('T8.1: Approves orders with 1.0x sizing multiplier in NORMAL tier', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setTier('NORMAL');
      const intent = createArbitrageIntent({ quantity: 0.1, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.scaledQuantity).toBe(0.1);
      expect(verdict.circuitBreakerTier).toBe('NORMAL');
    });

    it('T8.2: Rejects speculative order expansion in ALERT tier', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setTier('ALERT');
      const intent = createArbitrageIntent({ isRiskReducing: false, quantity: 0.1, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('Order expansion rejected in ALERT tier');
    });

    it('T8.3: Allows risk-reducing hedge orders in ALERT tier with 0.75x sizing', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setTier('ALERT');
      const hedge = createMarlIntent({ isRiskReducing: true, quantity: 1.0, price: 10000 });
      const verdict = gate.validateOrder(hedge);
      expect(verdict.approved).toBe(true);
      expect(verdict.scaledQuantity).toBe(0.75);
    });

    it('T8.4: Rejects speculative expansion in REDUCE tier and allows hedges with 0.50x sizing', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setTier('REDUCE');
      const spec = createAlphaLabIntent({ isRiskReducing: false });
      const hedge = createMarlIntent({ isRiskReducing: true, quantity: 1.0, price: 10000 });

      expect(gate.validateOrder(spec).approved).toBe(false);
      const hedgeVerdict = gate.validateOrder(hedge);
      expect(hedgeVerdict.approved).toBe(true);
      expect(hedgeVerdict.scaledQuantity).toBe(0.50);
    });

    it('T8.5: Rejects all order submissions in HALT and HARD_STOP tiers', () => {
      const gate = new MockSynchronizedRiskGate();
      const hedge = createMarlIntent({ isRiskReducing: true });

      gate.setTier('HALT');
      expect(gate.validateOrder(hedge).approved).toBe(false);

      gate.setTier('HARD_STOP');
      expect(gate.validateOrder(hedge).approved).toBe(false);
    });
  });

  describe('F9: Leverage & Concentration Guard', () => {
    it('T9.1: Approves order maintaining gross leverage ≤ 3.0x', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      gate.setVenuePosition('binance', 70000);
      gate.setVenuePosition('bybit', 70000);
      gate.setVenuePosition('polymarket_clob', 60000);
      const intent = createArbitrageIntent({ quantity: 0.5, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.grossLeverage).toBe(2.25);
    });

    it('T9.2: Rejects order pushing gross leverage above 3.0x', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 60000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      gate.setVenuePosition('binance', 90000);
      gate.setVenuePosition('bybit', 90000);
      gate.setVenuePosition('polymarket_clob', 90000);
      const intent = createArbitrageIntent({ quantity: 0.8, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('exceeds maximum ceiling 3.0x');
    });

    it('T9.3: Approves order with single-venue exposure ≤ 50%', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setVenuePosition('binance', 30000);
      gate.setVenuePosition('bybit', 40000);
      const intent = createArbitrageIntent({ venue: 'binance', quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
    });

    it('T9.4: Rejects order exceeding 50% concentration cap on a single venue', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setVenuePosition('binance', 45000);
      gate.setVenuePosition('bybit', 15000);
      const intent = createArbitrageIntent({ venue: 'binance', quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('concentration');
    });

    it('T9.5: Evaluates joint portfolio gross leverage across multi-venue positions', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setVenuePosition('binance', 50000);
      gate.setVenuePosition('bybit', 50000);
      gate.setVenuePosition('polymarket_clob', 50000);
      const intent = createArbitrageIntent({ venue: 'bybit', quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.grossLeverage).toBe(1.6);
    });
  });
}
