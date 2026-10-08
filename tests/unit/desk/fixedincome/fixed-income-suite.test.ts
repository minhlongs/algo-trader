import { describe, it, expect } from 'vitest';
import { NelsonSiegelSvenssonCurve } from '../../../../src/desk/fixedincome/nelson-siegel-svensson-curve';
import { BondFuturesBasisEngine } from '../../../../src/desk/fixedincome/bond-futures-basis-engine';
import { CheapestToDeliverCalculator } from '../../../../src/desk/fixedincome/cheapest-to-deliver-calculator';
import { NssParameters, BondSpecification, FuturesSpecification } from '../../../../src/desk/fixedincome/fixedincome-types';

describe('Fixed Income Basis & Term Structure Desk Suite', () => {
  describe('NelsonSiegelSvenssonCurve', () => {
    const params: NssParameters = {
      beta0: 4.5, // 4.5% long term
      beta1: -1.5, // 3.0% short rate (4.5 - 1.5)
      beta2: -2.0, // humping
      beta3: 1.0, // second humping
      tau1: 1.5,
      tau2: 5.0,
    };

    it('evaluates zero rate, discount factor, and forward rate smoothly', () => {
      const curve = new NelsonSiegelSvenssonCurve();

      const shortRate = curve.evaluateZeroRate(0.25, params);
      const tenYearRate = curve.evaluateZeroRate(10.0, params);
      const thirtyYearRate = curve.evaluateZeroRate(30.0, params);

      expect(shortRate).toBeGreaterThan(0);
      expect(tenYearRate).toBeGreaterThan(shortRate); // Upward sloping
      expect(thirtyYearRate).toBeCloseTo(4.5, 0); // Converges to beta0

      const df10 = curve.getDiscountFactor(10.0, params);
      expect(df10).toBeGreaterThan(0);
      expect(df10).toBeLessThan(1.0);

      const fwd10 = curve.evaluateInstantaneousForwardRate(10.0, params);
      expect(fwd10).toBeGreaterThan(0);
    });
  });

  describe('BondFuturesBasisEngine & CheapestToDeliverCalculator', () => {
    const futures: FuturesSpecification = {
      contractCode: 'ZN',
      futuresPrice: 110.0,
      daysToDelivery: 90,
      repoRatePct: 4.8, // 4.8% financing repo
    };

    const basket: BondSpecification[] = [
      {
        id: 'UST_4.125_2034',
        couponRatePct: 4.125,
        maturityYears: 9.8,
        cleanPrice: 99.5,
        accruedInterest: 0.8,
        conversionFactor: 0.895,
        accruedAtDelivery: 1.83,
      },
      {
        id: 'UST_3.875_2033',
        couponRatePct: 3.875,
        maturityYears: 9.2,
        cleanPrice: 97.2,
        accruedInterest: 0.6,
        conversionFactor: 0.88,
        accruedAtDelivery: 1.56,
      },
      {
        id: 'UST_4.500_2035',
        couponRatePct: 4.5,
        maturityYears: 10.5,
        cleanPrice: 102.8,
        accruedInterest: 1.1,
        conversionFactor: 0.925,
        accruedAtDelivery: 2.22,
      },
    ];

    it('computes gross basis, net basis, and IRR for deliverable bonds', () => {
      const engine = new BondFuturesBasisEngine();
      const metrics = engine.calculateBasis(basket[0]!, futures);

      expect(typeof metrics.grossBasis).toBe('number');
      expect(typeof metrics.netBasis).toBe('number');
      expect(typeof metrics.impliedRepoRatePct).toBe('number');
      expect(metrics.dirtyPrice).toBe(100.3); // 99.5 + 0.8
    });

    it('ranks basket and selects Cheapest-to-Deliver with maximum IRR', () => {
      const ctdCalc = new CheapestToDeliverCalculator();
      const result = ctdCalc.selectCheapestToDeliver(basket, futures);

      expect(result.rankings.length).toBe(3);
      expect(result.maxIrrBondId).toBeDefined();
      expect(result.cheapestBondId).toBeDefined();
      // Rankings must be ordered by IRR descending
      expect(result.rankings[0]!.impliedRepoRatePct).toBeGreaterThanOrEqual(result.rankings[1]!.impliedRepoRatePct);
    });
  });
});
