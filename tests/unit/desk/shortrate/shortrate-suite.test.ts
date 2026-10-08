import { describe, it, expect } from 'vitest';
import { HullWhiteZeroBondEngine } from '../../../../src/desk/shortrate/hull-white-zero-bond-engine';
import { JamshidianSwaptionPricer } from '../../../../src/desk/shortrate/jamshidian-swaption-pricer';
import { HullWhiteParams } from '../../../../src/desk/shortrate/hull-white-types';

describe('1-Factor Hull-White Short Rate Desk Suite', () => {
  const params: HullWhiteParams = {
    meanReversionA: 0.15,
    shortRateVolSigma: 0.012,
    currentShortRateR0: 0.035, // 3.5% initial rate
  };

  describe('HullWhiteZeroBondEngine', () => {
    it('computes zero-coupon bond discount factors and term structure yields', () => {
      const engine = new HullWhiteZeroBondEngine();
      const zcb5 = engine.priceZeroCouponBond(params, 5);
      const zcb10 = engine.priceZeroCouponBond(params, 10);

      expect(zcb5.discountFactorP).toBeLessThan(1.0);
      expect(zcb10.discountFactorP).toBeLessThan(zcb5.discountFactorP);
      expect(zcb5.zeroYieldPct).toBeGreaterThan(0);
      expect(zcb5.bFactor).toBeGreaterThan(0);
    });
  });

  describe('JamshidianSwaptionPricer', () => {
    it('prices European swaption using analytical Jamshidian decomposition', () => {
      const pricer = new JamshidianSwaptionPricer();
      const res = pricer.priceEuropeanSwaption(params, 3.5, 1.0, 5.0, true);

      expect(res.strikeYieldPct).toBe(3.5);
      expect(res.swaptionPriceBps).toBeGreaterThan(0);
      expect(res.criticalShortRateRStar).toBe(0.035);
    });
  });
});
