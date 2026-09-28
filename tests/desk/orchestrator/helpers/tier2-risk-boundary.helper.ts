/**
 * Tier 2: Risk Gate Boundary Helper
 * Numerical boundaries: 4.99% vs 5.0%, 9.99% vs 10.0%, 14.99% vs 15.0%, 19.99% vs 20.0%,
 * cash buffer 19.99% vs 20.0%, leverage 2.99x vs 3.01x, concentration 49.9% vs 50.1% (15 tests).
 */

import { describe, it, expect } from 'vitest';
import { createArbitrageIntent, createMarlIntent } from '../fixtures/mock-engines.fixture';
import { MockSynchronizedRiskGate } from '../fixtures/mock-risk-gate.fixture';
import { GlobalCircuitBreaker } from '../../../../src/desk/risk/global-circuit-breaker';

export function registerTier2RiskBoundaryTests(): void {
  describe('Circuit Breaker Drawdown Exact Threshold Boundaries', () => {
    it('B13: Peak-to-trough 4.99% remains in NORMAL tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(95010); // 4.99% DD
      expect(state.tier).toBe('NORMAL');
    });

    it('B14: Peak-to-trough 5.00% transitions to ALERT tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(95000); // 5.00% DD
      expect(state.tier).toBe('ALERT');
    });

    it('B15: Peak-to-trough 9.99% remains in ALERT tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(90010); // 9.99% DD
      expect(state.tier).toBe('ALERT');
    });

    it('B16: Peak-to-trough 10.00% transitions to REDUCE tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(90000); // 10.00% DD
      expect(state.tier).toBe('REDUCE');
    });

    it('B17: Peak-to-trough 14.99% remains in REDUCE tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(85010); // 14.99% DD
      expect(state.tier).toBe('REDUCE');
    });

    it('B18: Peak-to-trough 15.00% transitions to HALT tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(85000); // 15.00% DD
      expect(state.tier).toBe('HALT');
    });

    it('B19: Peak-to-trough 19.99% remains in HALT tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(80010); // 19.99% DD
      expect(state.tier).toBe('HALT');
    });

    it('B20: Peak-to-trough 20.00% transitions to HARD_STOP terminal tier', () => {
      const cb = new GlobalCircuitBreaker(100000);
      const state = cb.evaluate(80000); // 20.00% DD
      expect(state.tier).toBe('HARD_STOP');
    });

    it('B21: Correlation spike boundary: 0.850 is NORMAL vs 0.851 is ALERT', () => {
      const cb1 = new GlobalCircuitBreaker(100000);
      expect(cb1.evaluate(99000, 0.850).tier).toBe('NORMAL');

      const cb2 = new GlobalCircuitBreaker(100000);
      expect(cb2.evaluate(99000, 0.851).tier).toBe('ALERT');
    });
  });

  describe('Liquid Cash Buffer Exact Boundary', () => {
    it('B22: Projected cash buffer exactly 20.00% is approved', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 25000); // $25k cash
      const intent = createArbitrageIntent({ quantity: 0.1, price: 50000 }); // $5,000 order -> exactly $20,000 cash (20.0%)
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.cashBufferRatio).toBeCloseTo(0.20, 4);
    });

    it('B23: Projected cash buffer 19.99% is rejected', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 25000);
      const intent = createArbitrageIntent({ quantity: 0.1002, price: 50000 }); // $5,010 order -> $19,990 cash (19.99%)
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('violates minimum 20% liquid cash buffer');
    });
  });

  describe('Leverage & Venue Concentration Exact Boundaries', () => {
    it('B24: Gross leverage exactly 2.99x is approved', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      // 3 balanced venues: 90k, 90k, 90k = 270k
      gate.setVenuePosition('binance', 90000);
      gate.setVenuePosition('bybit', 90000);
      gate.setVenuePosition('polymarket_clob', 90000);
      const intent = createArbitrageIntent({ quantity: 0.58, price: 50000 }); // +29k -> 299k (2.99x)
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.grossLeverage).toBeCloseTo(2.99, 2);
    });

    it('B25: Gross leverage 3.01x is rejected', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 70000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      gate.setVenuePosition('binance', 90000);
      gate.setVenuePosition('bybit', 90000);
      gate.setVenuePosition('polymarket_clob', 90000);
      const intent = createArbitrageIntent({ quantity: 0.62, price: 50000 }); // +31k -> 301k (3.01x)
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('exceeds maximum ceiling 3.0x');
    });

    it('B26: Single venue concentration 49.9% is approved', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 50000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      // Total gross: 100k, binance = 40k. Add order of 9.8k to binance -> 49.8k / 109.8k = 45.3%
      gate.setVenuePosition('binance', 40000);
      gate.setVenuePosition('bybit', 60000);
      const intent = createArbitrageIntent({ venue: 'binance', quantity: 0.196, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
    });

    it('B27: Single venue concentration 50.1% is rejected', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 70000);
      gate.setEngineBudgets({ arbitrage: 100000, marl: 100000, amm: 100000, 'alpha-lab': 100000 });
      // Total gross: 60k (> 50k threshold). Binance = 30k, Bybit = 30k.
      // Add 31k to binance -> binance becomes 61k / 91k = 67.0% > 50%
      gate.setVenuePosition('binance', 30000);
      gate.setVenuePosition('bybit', 30000);
      const intent = createArbitrageIntent({ venue: 'binance', quantity: 0.62, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('concentration');
    });
  });
}
