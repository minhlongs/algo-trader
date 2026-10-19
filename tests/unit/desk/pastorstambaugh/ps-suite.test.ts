import { describe, it, expect } from 'vitest';
import { PsEngine } from '../../../../src/desk/pastorstambaugh/ps-engine.js';
import { PsMath } from '../../../../src/desk/pastorstambaugh/ps-math.js';
import { PsStockObservation } from '../../../../src/desk/pastorstambaugh/ps-types.js';

describe('Pástor-Stambaugh (2003) Liquidity Risk Suite', () => {
  describe('PsMath OLS and Matrix Inversion', () => {
    it('inverts a 2x2 matrix correctly', () => {
      const A = [
        [4, 7],
        [2, 6],
      ];
      const inv = PsMath.invertMatrix(A);
      // Det = 24 - 14 = 10. Inv = [[0.6, -0.7], [-0.2, 0.4]]
      expect(inv[0][0]).toBeCloseTo(0.6, 5);
      expect(inv[0][1]).toBeCloseTo(-0.7, 5);
      expect(inv[1][0]).toBeCloseTo(-0.2, 5);
      expect(inv[1][1]).toBeCloseTo(0.4, 5);
    });

    it('performs accurate OLS regression on synthetic linear relation', () => {
      // y = 2 + 3*x1 - 1.5*x2 with linearly independent regressors
      const X: number[][] = [];
      const y: number[] = [];
      for (let i = 0; i < 20; i++) {
        const x1 = i * 0.5;
        const x2 = Math.sin(i);
        X.push([1.0, x1, x2]);
        y.push(2.0 + 3.0 * x1 - 1.5 * x2);
      }

      const reg = PsMath.ols(y, X);
      expect(reg.beta[0]).toBeCloseTo(2.0, 5);
      expect(reg.beta[1]).toBeCloseTo(3.0, 5);
      expect(reg.beta[2]).toBeCloseTo(-1.5, 5);
      expect(reg.rSquared).toBeCloseTo(1.0, 5);
    });
  });

  describe('PsEngine Empirical Liquidity Estimation', () => {
    it('estimates negative gamma for order-flow price reversals', () => {
      // Generate synthetic daily observations where high buy volume creates next-day negative reversal
      const observations: PsStockObservation[] = [];
      for (let d = 0; d < 30; d++) {
        const signedVol = (d % 2 === 0 ? 1 : -1) * (1000 + d * 50);
        // Next excess return has negative relationship with signed volume
        const returnNext = -0.00002 * signedVol + (d % 3 === 0 ? 0.005 : -0.005);
        observations.push({
          returnNext,
          returnCurrent: 0.01 * (d % 2 === 0 ? 1 : -1),
          marketReturnNext: 0.001,
          dollarVolume: Math.abs(signedVol),
          signedVolume: signedVol,
        });
      }

      const res = PsEngine.estimateStockGamma(observations);
      expect(res.gamma).toBeLessThan(0); // Liquidity bounce / reversal
      expect(Number.isFinite(res.tStat)).toBe(true);
      expect(res.sampleSize).toBe(30);
    });

    it('extracts AR(1) innovations from market liquidity time series', () => {
      const series: number[] = [];
      let val = -0.05;
      for (let t = 0; t < 25; t++) {
        val = 0.6 * val + 0.02 * (Math.sin(t) * 0.5);
        series.push(val);
      }

      const res = PsEngine.extractInnovations(series);
      expect(res.innovations.length).toBe(24);
      expect(res.persistence).toBeGreaterThan(0);
      expect(res.persistence).toBeLessThan(1.0);
      expect(res.variance).toBeGreaterThan(0);
    });

    it('estimates liquidity beta against aggregate innovations', () => {
      const N = 20;
      const excessReturns: number[] = [];
      const marketExcess: number[] = [];
      const liqInnovations: number[] = [];

      for (let i = 0; i < N; i++) {
        const mkt = 0.02 + 0.01 * Math.sin(i);
        const liq = 0.005 * Math.cos(i);
        marketExcess.push(mkt);
        liqInnovations.push(liq);
        // Asset has marketBeta = 1.2, liquidityBeta = 0.8
        excessReturns.push(0.001 + 1.2 * mkt + 0.8 * liq);
      }

      const res = PsEngine.estimateLiquidityBeta(excessReturns, marketExcess, liqInnovations);
      expect(res.marketBeta).toBeCloseTo(1.2, 4);
      expect(res.liquidityBeta).toBeCloseTo(0.8, 4);
      expect(res.alpha).toBeCloseTo(0.001, 4);
      expect(res.rSquared).toBeCloseTo(1.0, 4);
    });
  });
});
