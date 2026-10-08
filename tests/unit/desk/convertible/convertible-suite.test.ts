import { describe, it, expect } from 'vitest';
import { ConvertiblePricingEngine } from '../../../../src/desk/convertible/convertible-pricing-engine';
import { ConvertibleDeltaHedger } from '../../../../src/desk/convertible/convertible-delta-hedger';
import { ConvertibleTerms, EquityState } from '../../../../src/desk/convertible/convertible-types';

describe('Convertible Bond Arbitrage Desk Suite', () => {
  const terms: ConvertibleTerms = {
    cusipOrTicker: 'TECH_CB_2028',
    parValueUsd: 1000,
    couponRatePct: 2.0,
    maturityYears: 3,
    conversionRatio: 20, // Effective strike = $50
    creditSpreadBps: 250, // 2.50% credit spread
    riskFreeRatePct: 4.0,
  };

  const equity: EquityState = {
    stockPriceUsd: 48,
    annualizedVolatilityPct: 35.0,
    dividendYieldPct: 1.0,
  };

  describe('ConvertiblePricingEngine', () => {
    it('prices convertible bond floor, conversion parity, and Greeks', () => {
      const pricer = new ConvertiblePricingEngine();
      const res = pricer.valueConvertible(terms, equity);

      expect(res.conversionValueUsd).toBe(960); // 20 * 48
      expect(res.bondFloorUsd).toBeLessThan(1000); // 2% coupon vs 6.5% discount rate
      expect(res.theoreticalPriceUsd).toBeGreaterThan(res.conversionValueUsd);
      expect(res.delta).toBeGreaterThan(0);
      expect(res.gamma).toBeGreaterThan(0);
      expect(res.conversionPremiumPct).toBeGreaterThan(0);
    });
  });

  describe('ConvertibleDeltaHedger', () => {
    it('computes short equity hedge shares and gamma scalping PnL', () => {
      const pricer = new ConvertiblePricingEngine();
      const hedger = new ConvertibleDeltaHedger();

      const valuation = pricer.valueConvertible(terms, equity);
      const hedge = hedger.computeHedge(valuation, 100, equity.stockPriceUsd, 5.0); // 5% stock rally

      expect(hedge.totalBondsHeld).toBe(100);
      expect(hedge.sharesToShort).toBeGreaterThan(0);
      expect(hedge.estimatedGammaProfitUsd).toBeGreaterThan(0);
    });
  });
});
