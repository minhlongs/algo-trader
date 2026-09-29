/**
 * Tier 1: Multi-Source Signal Ingestion & Priority Scoring (F1 & F2)
 * Ingestion and priority calculations across Arbitrage, MARL, AMM, Alpha-Lab (10 tests).
 */

import { describe, it, expect } from 'vitest';
import {
  createArbitrageIntent,
  createMarlIntent,
  createAmmIntent,
  createAlphaLabIntent,
  calculateMockPriority,
} from '../fixtures/mock-engines.fixture';

export function registerTier1SignalIngestionTests(): void {
  describe('F1: Multi-Source Signal Ingestion', () => {
    it('T1.1: Ingests Arbitrage opportunity with HIGH urgency and IOC order type', () => {
      const intent = createArbitrageIntent({ quantity: 1.5, expectedEdgeBps: 55 });
      expect(intent.engineId).toBe('arbitrage');
      expect(intent.urgency).toBe('HIGH');
      expect(intent.orderType).toBe('IOC');
      expect(intent.quantity).toBe(1.5);
    });

    it('T1.2: Ingests MARL quote proposal with passive order type', () => {
      const intent = createMarlIntent({ isRiskReducing: false });
      expect(intent.engineId).toBe('marl');
      expect(intent.urgency).toBe('LOW');
      expect(intent.orderType).toBe('TWO_SIDED_QUOTE');
      expect(intent.isRiskReducing).toBe(false);
    });

    it('T1.3: Ingests MARL delta-neutral hedge with isRiskReducing: true and HIGH urgency', () => {
      const intent = createMarlIntent({ isRiskReducing: true, side: 'SELL' });
      expect(intent.engineId).toBe('marl');
      expect(intent.isRiskReducing).toBe(true);
      expect(intent.urgency).toBe('HIGH');
      expect(intent.orderType).toBe('MARKET');
    });

    it('T1.4: Ingests AMM liquidity rebalance order with correct venue and expiry', () => {
      const intent = createAmmIntent({ venue: 'amm_lmsr', quantity: 10 });
      expect(intent.engineId).toBe('amm');
      expect(intent.venue).toBe('amm_lmsr');
      expect(intent.quantity).toBe(10);
      expect(intent.timeToExpiryMs).toBeGreaterThan(0);
    });

    it('T1.5: Ingests Alpha-Lab quantitative signal with calibrated confidence and holding period', () => {
      const intent = createAlphaLabIntent({ expectedSharpe: 2.4, expectedEdgeBps: 90 });
      expect(intent.engineId).toBe('alpha-lab');
      expect(intent.expectedSharpe).toBe(2.4);
      expect(intent.timeToExpiryMs).toBe(86400000);
      expect(intent.isRiskReducing).toBe(false);
    });
  });

  describe('F2: Priority-Weighted Signal Queue', () => {
    it('T2.1: Prioritizes HIGH urgency intents over MEDIUM and LOW urgency', () => {
      const high = createArbitrageIntent({ urgency: 'HIGH' });
      const low = createAlphaLabIntent({ urgency: 'LOW' });
      const pHigh = calculateMockPriority(high);
      const pLow = calculateMockPriority(low);
      expect(pHigh.compositePriority).toBeGreaterThan(pLow.compositePriority);
    });

    it('T2.2: Applies +500 risk-reduction boost to delta hedges and unwinds', () => {
      const hedge = createMarlIntent({ isRiskReducing: true, urgency: 'HIGH' });
      const spec = createArbitrageIntent({ isRiskReducing: false, urgency: 'HIGH' });
      const pHedge = calculateMockPriority(hedge);
      const pSpec = calculateMockPriority(spec);
      expect(pHedge.riskReductionBoost).toBe(500);
      expect(pSpec.riskReductionBoost).toBe(0);
      expect(pHedge.compositePriority).toBeGreaterThan(pSpec.compositePriority);
    });

    it('T2.3: Incorporates expectedEdgeBps into composite priority ranking', () => {
      const highEdge = createArbitrageIntent({ expectedEdgeBps: 100, urgency: 'MEDIUM' });
      const lowEdge = createArbitrageIntent({ expectedEdgeBps: 10, urgency: 'MEDIUM' });
      expect(calculateMockPriority(highEdge).edgeScore).toBeGreaterThan(
        calculateMockPriority(lowEdge).edgeScore
      );
    });

    it('T2.4: Incorporates expectedSharpe into composite priority ranking', () => {
      const highSharpe = createAlphaLabIntent({ expectedSharpe: 3.5, urgency: 'LOW' });
      const lowSharpe = createAlphaLabIntent({ expectedSharpe: 0.5, urgency: 'LOW' });
      expect(calculateMockPriority(highSharpe).sharpeScore).toBeGreaterThan(
        calculateMockPriority(lowSharpe).sharpeScore
      );
    });

    it('T2.5: Prioritizes imminent expiry over distant expiry when urgency is equal', () => {
      const now = Date.now();
      const imminent = createArbitrageIntent({ urgency: 'MEDIUM', timeToExpiryMs: 100, expiresAt: now + 100 });
      const distant = createArbitrageIntent({ urgency: 'MEDIUM', timeToExpiryMs: 86400000, expiresAt: now + 86400000 });
      expect(calculateMockPriority(imminent, now).expiryScore).toBeGreaterThan(
        calculateMockPriority(distant, now).expiryScore
      );
    });
  });
}
