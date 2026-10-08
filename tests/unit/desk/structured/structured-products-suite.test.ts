import { describe, it, expect } from 'vitest';
import { BarrierOptionPricer } from '../../../../src/desk/structured/barrier-option-pricer';
import { AutocallableNotePricer } from '../../../../src/desk/structured/autocallable-note-pricer';
import { CliquetPayoffEngine } from '../../../../src/desk/structured/cliquet-payoff-engine';

describe('Exotic Derivatives & Structured Products Suite', () => {
  describe('BarrierOptionPricer', () => {
    it('prices down-and-out call option with reflection principle and greeks', () => {
      const pricer = new BarrierOptionPricer();

      const result = pricer.priceBarrierOption({
        spotPrice: 100,
        strikePrice: 100,
        barrierLevel: 80,
        rebate: 0,
        timeToExpiryYears: 1.0,
        riskFreeRate: 0.05,
        volatilitySigma: 0.20,
        barrierType: 'DOWN_AND_OUT_CALL',
      });

      expect(result.optionPrice).toBeGreaterThan(0);
      expect(result.optionPrice).toBeLessThanOrEqual(result.vanillaOptionPrice);
      expect(result.barrierHitProbability).toBeGreaterThan(0);
      expect(result.barrierHitProbability).toBeLessThan(1.0);
      expect(result.delta).toBeGreaterThan(0);
    });

    it('honors in-out parity: down-and-in + down-and-out equals vanilla call', () => {
      const pricer = new BarrierOptionPricer();

      const downOut = pricer.priceBarrierOption({
        spotPrice: 100,
        strikePrice: 100,
        barrierLevel: 85,
        rebate: 0,
        timeToExpiryYears: 0.5,
        riskFreeRate: 0.04,
        volatilitySigma: 0.25,
        barrierType: 'DOWN_AND_OUT_CALL',
      });

      const downIn = pricer.priceBarrierOption({
        spotPrice: 100,
        strikePrice: 100,
        barrierLevel: 85,
        rebate: 0,
        timeToExpiryYears: 0.5,
        riskFreeRate: 0.04,
        volatilitySigma: 0.25,
        barrierType: 'DOWN_AND_IN_CALL',
      });

      expect(downIn.optionPrice + downOut.optionPrice).toBeCloseTo(downOut.vanillaOptionPrice, 3);
    });

    it('returns rebate on immediate knock out', () => {
      const pricer = new BarrierOptionPricer();

      const result = pricer.priceBarrierOption({
        spotPrice: 75,
        strikePrice: 100,
        barrierLevel: 80,
        rebate: 5.0,
        timeToExpiryYears: 1.0,
        riskFreeRate: 0.05,
        volatilitySigma: 0.20,
        barrierType: 'DOWN_AND_OUT_CALL',
      });

      expect(result.optionPrice).toBe(5.0);
      expect(result.barrierHitProbability).toBe(1.0);
    });
  });

  describe('AutocallableNotePricer', () => {
    it('evaluates worst-of basket and triggers autocall early with coupon payment', () => {
      const pricer = new AutocallableNotePricer();

      const basket = [
        { symbol: 'AAPL', initialSpotPrice: 200, currentSpotPrice: 220 }, // +10%
        { symbol: 'MSFT', initialSpotPrice: 400, currentSpotPrice: 420 }, // +5%
        { symbol: 'NVDA', initialSpotPrice: 100, currentSpotPrice: 102 }, // +2% (Worst: 1.02)
      ];

      const schedule = [
        { observationMonth: 6, autocallBarrierPct: 1.00, couponRatePct: 0.04 },
        { observationMonth: 12, autocallBarrierPct: 0.95, couponRatePct: 0.04 },
      ];

      const result = pricer.evaluateAutocallableNote(basket, schedule, 0.70);

      expect(result.isAutocalled).toBe(true);
      expect(result.autocallTriggerMonth).toBe(6);
      expect(result.worstPerformingAsset).toBe('NVDA');
      expect(result.worstPerformanceRatio).toBe(1.02);
      expect(result.capitalRedemptionPct).toBe(1.0);
      expect(result.totalCouponPaidPct).toBe(0.04);
    });

    it('handles knock-in breach at maturity when no autocall triggers', () => {
      const pricer = new AutocallableNotePricer();

      const basket = [
        { symbol: 'GOOGL', initialSpotPrice: 150, currentSpotPrice: 160 },
        { symbol: 'TSLA', initialSpotPrice: 250, currentSpotPrice: 150 }, // -40% -> ratio 0.60 < 0.70 barrier
      ];

      const schedule = [
        { observationMonth: 12, autocallBarrierPct: 1.00, couponRatePct: 0.05 },
      ];

      const result = pricer.evaluateAutocallableNote(basket, schedule, 0.70);

      expect(result.isAutocalled).toBe(false);
      expect(result.worstPerformingAsset).toBe('TSLA');
      expect(result.worstPerformanceRatio).toBe(0.60);
      expect(result.capitalRedemptionPct).toBe(0.60); // Knocks in
    });
  });

  describe('CliquetPayoffEngine', () => {
    it('applies local cap, local floor and guarantees global floor', () => {
      const engine = new CliquetPayoffEngine();

      const params = {
        notionalUsd: 1_000_000,
        localCapPct: 0.05, // +5% cap
        localFloorPct: -0.02, // -2% floor
        globalFloorPct: 0.00, // Capital guarantee
        periodReturnsPct: [0.08, -0.05, 0.02, 0.04], // Raw returns
      };

      const result = engine.calculatePayoff(params);

      // Capped/floored returns:
      // 0.08 -> 0.05
      // -0.05 -> -0.02
      // 0.02 -> 0.02
      // 0.04 -> 0.04
      // Sum = 0.05 - 0.02 + 0.02 + 0.04 = 0.09
      expect(result.cappedFlooredPeriodReturns).toEqual([0.05, -0.02, 0.02, 0.04]);
      expect(result.sumCappedReturnsPct).toBe(0.09);
      expect(result.effectivePayoffPct).toBe(0.09);
      expect(result.totalPayoutUsd).toBe(1_090_000);
    });

    it('protects principal with global floor when sum of capped returns is negative', () => {
      const engine = new CliquetPayoffEngine();

      const params = {
        notionalUsd: 500_000,
        localCapPct: 0.03,
        localFloorPct: -0.03,
        globalFloorPct: 0.00,
        periodReturnsPct: [-0.05, -0.04, -0.02], // Floored to -0.03, -0.03, -0.02 -> sum -0.08
      };

      const result = engine.calculatePayoff(params);

      expect(result.sumCappedReturnsPct).toBe(-0.08);
      expect(result.effectivePayoffPct).toBe(0.00); // Protected by global floor
      expect(result.totalPayoutUsd).toBe(500_000);
    });
  });
});
