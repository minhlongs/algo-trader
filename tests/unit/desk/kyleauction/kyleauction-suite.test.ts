import { describe, it, expect } from 'vitest';
import { KyleAuctionEngine } from '../../../../src/desk/kyleauction/kyleauction-engine.js';
import { KyleAuctionMath } from '../../../../src/desk/kyleauction/kyleauction-math.js';
import { KyleAuctionParams } from '../../../../src/desk/kyleauction/kyleauction-types.js';

describe('Kyle (1985) Continuous Auction Adverse Selection Suite', () => {
  describe('KyleAuctionMath Microstructure Equilibria', () => {
    it('solves single period batch equilibrium lambda and beta', () => {
      const priorVar = 4.0;
      const noiseVar = 1.0;
      const { lambda, beta } = KyleAuctionMath.calculateSinglePeriodEquilibrium(priorVar, noiseVar);

      // lambda = sqrt(4) / (2 * sqrt(1)) = 2 / 2 = 1.0
      // beta = sqrt(1) / sqrt(4) = 0.5
      expect(lambda).toBeCloseTo(1.0, 5);
      expect(beta).toBeCloseTo(0.5, 5);
    });

    it('updates posterior variance after order flow revelation', () => {
      const postVar = KyleAuctionMath.updatePosteriorVariance(4.0, 0.5, 1.0);
      // Sigma_1 = 4 * (1 - 0.5 * 1.0) = 2.0 (50% information revealed in single auction)
      expect(postVar).toBeCloseTo(2.0, 5);
    });
  });

  describe('KyleAuctionEngine Batch & Dynamic Multistage Auctions', () => {
    const params: KyleAuctionParams = {
      priorMean: 100,
      priorVariance: 16.0,
      noiseOrderFlowVariance: 4.0,
    };

    it('solves batch auction equilibrium characteristics', () => {
      const res = KyleAuctionEngine.solveBatchAuction(params);
      expect(res.lambda).toBeCloseTo(1.0, 5); // sqrt(16) / (2*sqrt(4)) = 4 / 4 = 1
      expect(res.beta).toBeCloseTo(0.5, 5); // sqrt(4) / sqrt(16) = 2 / 4 = 0.5
      expect(res.marketDepth).toBeCloseTo(1.0, 5);
      expect(res.informationEfficiency).toBeCloseTo(0.5, 5);
      expect(res.residualVariance).toBeCloseTo(8.0, 5);
      expect(res.expectedProfit).toBeGreaterThan(0);
    });

    it('simulates multi-period dynamic sequential auction with gradual variance reduction', () => {
      const multistageParams: KyleAuctionParams = {
        ...params,
        numPeriods: 4,
      };
      const trajectory = KyleAuctionEngine.solveMultiPeriodAuction(multistageParams);
      expect(trajectory.length).toBe(4);

      // Variance should monotonically decrease across periods
      expect(trajectory[0].residualVariance).toBeLessThan(params.priorVariance);
      expect(trajectory[1].residualVariance).toBeLessThan(trajectory[0].residualVariance);
      expect(trajectory[2].residualVariance).toBeLessThan(trajectory[1].residualVariance);
      expect(trajectory[3].residualVariance).toBeLessThan(trajectory[2].residualVariance);

      // Cumulative info revealed should monotonically increase
      expect(trajectory[3].cumulativeInfoRevealed).toBeGreaterThan(trajectory[0].cumulativeInfoRevealed);
    });

    it('throws on invalid inputs', () => {
      expect(() => KyleAuctionEngine.solveBatchAuction({ ...params, priorVariance: -1 })).toThrow();
      expect(() => KyleAuctionEngine.solveBatchAuction({ ...params, noiseOrderFlowVariance: 0 })).toThrow();
    });
  });
});
