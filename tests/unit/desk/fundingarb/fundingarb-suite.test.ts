import { describe, it, expect } from 'vitest';
import { PerpetualFundingPredictor } from '../../../../src/desk/fundingarb/perpetual-funding-predictor';
import { DeltaNeutralCarryHedger } from '../../../../src/desk/fundingarb/delta-neutral-carry-hedger';
import {
  PerpMarketQuote,
  DeltaNeutralPositionConfig,
} from '../../../../src/desk/fundingarb/funding-types';

describe('Crypto Basis & Funding Rate Arb Desk Suite', () => {
  describe('PerpetualFundingPredictor', () => {
    it('computes 8-hour funding rate and annualized carry APY', () => {
      const predictor = new PerpetualFundingPredictor();

      const quote: PerpMarketQuote = {
        symbol: 'BTC-PERP',
        markPrice: 65100,
        indexPrice: 65000,
        impactBidPrice: 65050,
        impactAskPrice: 65150,
      };

      const res = predictor.computeFundingRate(quote);

      expect(res.symbol).toBe('BTC-PERP');
      expect(res.eightHourFundingRatePct).toBeGreaterThanOrEqual(-0.05);
      expect(res.eightHourFundingRatePct).toBeLessThanOrEqual(0.06);
      expect(res.annualizedCarryApyPct).toBeDefined();
    });

    it('throws error when index price is invalid', () => {
      const predictor = new PerpetualFundingPredictor();
      const invalidQuote: PerpMarketQuote = {
        symbol: 'ETH-PERP',
        markPrice: 3000,
        indexPrice: 0,
        impactBidPrice: 3000,
        impactAskPrice: 3000,
      };
      expect(() => predictor.computeFundingRate(invalidQuote)).toThrow('Index price must be strictly positive');
    });
  });

  describe('DeltaNeutralCarryHedger', () => {
    it('constructs delta-neutral position and evaluates liquidation buffer', () => {
      const hedger = new DeltaNeutralCarryHedger();

      const config: DeltaNeutralPositionConfig = {
        capitalUsd: 100000,
        spotPrice: 65000,
        perpMarkPrice: 65000,
        leverage: 3, // 3x leverage on short perp
        maintenanceMarginPct: 5.0,
      };

      const hedge = hedger.constructDeltaNeutralHedge(config, 0.02); // 0.02% per 8h funding

      expect(hedge.spotQuantity).toBeGreaterThan(0);
      expect(hedge.perpShortQuantity).toBeGreaterThan(0);
      expect(hedge.netDeltaUsd).toBeCloseTo(0, 1); // Delta neutral
      expect(hedge.liquidationPricePerp).toBeGreaterThan(65000); // Higher price triggers short liquidation
      expect(hedge.liquidationBufferPct).toBeGreaterThan(15.0);
      expect(hedge.isLiquidationRiskElevated).toBe(false);
      expect(hedge.projectedDailyYieldUsd).toBeGreaterThan(0);
    });
  });
});
