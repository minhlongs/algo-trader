import { describe, it, expect } from 'vitest';
import { ImpliedEquilibriumPriorCalculator } from '../../../../src/desk/blacklitterman/implied-equilibrium-prior-calculator';
import { BlackLittermanBlender } from '../../../../src/desk/blacklitterman/black-litterman-blender';
import {
  MarketPriorInputs,
  InvestorView,
} from '../../../../src/desk/blacklitterman/black-litterman-types';

describe('Black-Litterman Portfolio Asset Allocation Desk Suite', () => {
  const inputs: MarketPriorInputs = {
    assetSymbols: ['SPY', 'QQQ'],
    marketCapsUsd: [600000000, 400000000], // 60% SPY, 40% QQQ
    covarianceMatrix: [
      [0.04, 0.02],
      [0.02, 0.06],
    ],
    riskAversionLambda: 2.5,
  };

  describe('ImpliedEquilibriumPriorCalculator', () => {
    it('computes reverse-optimized implied market equilibrium returns', () => {
      const calc = new ImpliedEquilibriumPriorCalculator();
      const res = calc.computeImpliedEquilibrium(inputs);

      expect(res.marketWeights).toEqual([0.6, 0.4]);
      // Pi_1 = 2.5 * (0.04 * 0.6 + 0.02 * 0.4) = 2.5 * 0.032 = 0.080
      // Pi_2 = 2.5 * (0.02 * 0.6 + 0.06 * 0.4) = 2.5 * 0.036 = 0.090
      expect(res.impliedPriorReturns[0]).toBeCloseTo(0.08, 3);
      expect(res.impliedPriorReturns[1]).toBeCloseTo(0.09, 3);
    });
  });

  describe('BlackLittermanBlender', () => {
    it('blends investor view with market prior to tilt optimal weights', () => {
      const blender = new BlackLittermanBlender();

      // Bullish view on QQQ vs SPY (relative view: QQQ outperforms SPY by 4%)
      const views: InvestorView[] = [
        {
          description: 'QQQ outperforms SPY',
          pickVectorP: [-1, 1], // Long QQQ, Short SPY
          expectedViewReturnQ: 0.04,
          viewConfidenceVarianceOmega: 0.005,
        },
      ];

      const res = blender.blendViews(inputs, views);

      expect(res.assetSymbols).toEqual(['SPY', 'QQQ']);
      expect(res.posteriorReturns.length).toBe(2);

      // QQQ should receive positive active tilt, SPY negative active tilt
      expect(res.activeWeightTilts[1]).toBeGreaterThan(0);
      expect(res.activeWeightTilts[0]).toBeLessThan(0);
      expect(res.optimalWeights[0]! + res.optimalWeights[1]!).toBeCloseTo(1.0, 4);
    });

    it('returns market weights when no views are provided', () => {
      const blender = new BlackLittermanBlender();
      const res = blender.blendViews(inputs, []);
      expect(res.optimalWeights).toEqual([0.6, 0.4]);
      expect(res.activeWeightTilts).toEqual([0, 0]);
    });
  });
});
