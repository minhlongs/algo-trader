import {
  KyleAuctionParams,
  KyleBatchAuctionResult,
  KyleMultiPeriodStep,
} from './kyleauction-types.js';
import { KyleAuctionMath } from './kyleauction-math.js';

export class KyleAuctionEngine {
  public static validate(params: KyleAuctionParams): void {
    if (params.priorVariance <= 0) throw new Error('Prior variance must be positive');
    if (params.noiseOrderFlowVariance <= 0) throw new Error('Noise order flow variance must be positive');
    if (params.numPeriods !== undefined && params.numPeriods < 1) {
      throw new Error('Number of periods must be at least 1');
    }
  }

  /**
   * Evaluates standard single-period batch auction equilibrium.
   */
  public static solveBatchAuction(params: KyleAuctionParams): KyleBatchAuctionResult {
    this.validate(params);
    const { priorVariance: Sigma0, noiseOrderFlowVariance: sigmaU2 } = params;

    const { lambda, beta } = KyleAuctionMath.calculateSinglePeriodEquilibrium(Sigma0, sigmaU2);
    const marketDepth = 1.0 / lambda;
    const residualVariance = KyleAuctionMath.updatePosteriorVariance(Sigma0, beta, lambda);
    const expectedProfit = 0.5 * Math.sqrt(Sigma0 * sigmaU2);
    const informationEfficiency = (Sigma0 - residualVariance) / Sigma0;

    return {
      lambda,
      beta,
      marketDepth,
      expectedProfit,
      residualVariance,
      informationEfficiency,
    };
  }

  /**
   * Simulates multi-period dynamic Kyle auction where informed trader discretely trades over N stages.
   */
  public static solveMultiPeriodAuction(params: KyleAuctionParams): KyleMultiPeriodStep[] {
    this.validate(params);
    const N = params.numPeriods ?? 1;
    let currentVariance = params.priorVariance;
    const initialVariance = params.priorVariance;
    // Per-period noise variance: sigma_u^2 / N
    const deltaNoiseVariance = params.noiseOrderFlowVariance / N;

    const trajectory: KyleMultiPeriodStep[] = [];

    for (let t = 1; t <= N; t++) {
      const { lambda, beta } = KyleAuctionMath.calculateSinglePeriodEquilibrium(
        currentVariance,
        deltaNoiseVariance
      );
      const residualVariance = KyleAuctionMath.updatePosteriorVariance(currentVariance, beta, lambda);
      const cumulativeInfoRevealed = (initialVariance - residualVariance) / initialVariance;

      trajectory.push({
        period: t,
        lambda,
        beta,
        marketDepth: 1.0 / lambda,
        residualVariance,
        cumulativeInfoRevealed,
      });

      currentVariance = residualVariance;
    }

    return trajectory;
  }
}
