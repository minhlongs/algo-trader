/**
 * Tier 1: Capital Budgeting & Cash Buffer Guard Helper (F6 - F7)
 * Covers R2 pre-trade capital and liquidity requirements in isolation (10 tests).
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAlphaLabIntent,
} from '../fixtures/mock-engines.fixture';
import { MockSynchronizedRiskGate } from '../fixtures/mock-risk-gate.fixture';

export function registerTier1RiskBudgetTests(): void {
  describe('F6: Real-Time Capital Budgeting Gate', () => {
    it('T6.1: Approves order notional within remaining engine budget', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setEngineBudgets({ arbitrage: 20000, marl: 20000, amm: 20000, 'alpha-lab': 20000 });
      const intent = createArbitrageIntent({ quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.allocatedCapitalUsd).toBe(20000);
    });

    it('T6.2: Rejects order notional exceeding engine budget with descriptive reason', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setEngineBudgets({ arbitrage: 10000, marl: 20000, amm: 20000, 'alpha-lab': 20000 });
      const intent = createArbitrageIntent({ quantity: 0.5, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('exceeds remaining engine budget');
    });

    it('T6.3: Tracks remaining budget independently across all 4 engines', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setEngineBudgets({ arbitrage: 5000, marl: 30000, amm: 15000, 'alpha-lab': 20000 });

      const arbIntent = createArbitrageIntent({ quantity: 0.2, price: 50000 });
      const marlIntent = createMarlIntent({ quantity: 0.2, price: 50000 });

      expect(gate.validateOrder(arbIntent).approved).toBe(false);
      expect(gate.validateOrder(marlIntent).approved).toBe(true);
    });

    it('T6.4: Adapts dynamically to updated engine budgets from PortfolioAllocator', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setEngineBudgets({ arbitrage: 5000, marl: 5000, amm: 5000, 'alpha-lab': 5000 });
      const intent = createAlphaLabIntent({ quantity: 0.2, price: 50000 });
      expect(gate.validateOrder(intent).approved).toBe(false);

      gate.setEngineBudgets({ arbitrage: 5000, marl: 5000, amm: 5000, 'alpha-lab': 25000 });
      expect(gate.validateOrder(intent).approved).toBe(true);
    });

    it('T6.5: Reflects allocated capital in verdict metadata', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setEngineBudgets({ arbitrage: 15000, marl: 10000, amm: 10000, 'alpha-lab': 10000 });
      const intent = createArbitrageIntent({ quantity: 0.1, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.allocatedCapitalUsd).toBe(15000);
    });
  });

  describe('F7: Liquid Cash Buffer Guard (≥20% NAV)', () => {
    it('T7.1: Approves order preserving ≥20% cash buffer ratio', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 30000);
      const intent = createArbitrageIntent({ quantity: 0.1, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.cashBufferRatio).toBe(0.25);
    });

    it('T7.2: Rejects order causing projected cash buffer to drop below 20% NAV', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 25000);
      const intent = createArbitrageIntent({ quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('violates minimum 20% liquid cash buffer');
    });

    it('T7.3: Preserves exactly 20% threshold at boundary', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 30000);
      const intent = createArbitrageIntent({ quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(true);
      expect(verdict.cashBufferRatio).toBe(0.20);
    });

    it('T7.4: Rejects when current cash is already below 20% NAV', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(100000, 18000);
      const intent = createArbitrageIntent({ quantity: 0.01, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.approved).toBe(false);
      expect(verdict.reason).toContain('violates minimum 20% liquid cash buffer');
    });

    it('T7.5: Calculates projected cash buffer ratio accurately in verdict', () => {
      const gate = new MockSynchronizedRiskGate();
      gate.setNavAndCash(200000, 60000);
      const intent = createArbitrageIntent({ quantity: 0.2, price: 50000 });
      const verdict = gate.validateOrder(intent);
      expect(verdict.cashBufferRatio).toBe(0.25);
    });
  });
}
