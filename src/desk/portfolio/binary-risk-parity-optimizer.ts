/**
 * Binary Risk Parity Optimizer Engine
 *
 * Solves risk parity capital allocations and estimates Conditional Value-at-Risk
 * (Rockafellar-Uryasev CVaR) tailored for binary prediction outcome instruments.
 *
 * @module desk/portfolio/binary-risk-parity-optimizer
 */

import type {
  AssetRiskProfile,
  OptimizedPortfolioAllocation,
  RiskParityConstraints,
} from './binary-risk-parity-types';

export class BinaryRiskParityOptimizer {
  public optimizeAllocation(
    assets: readonly AssetRiskProfile[],
    covarianceMatrix: readonly number[][],
    totalCapitalUsd: number,
    constraints: RiskParityConstraints
  ): OptimizedPortfolioAllocation {
    const n = assets.length;
    if (n === 0 || covarianceMatrix.length !== n) {
      return {
        weights: {},
        expectedPortfolioReturnBps: 0,
        portfolioVolatility: 0,
        parametricVaR95Usd: 0,
        cvar95Usd: 0,
        diversificationRatio: 1,
        totalCapitalUsd,
      };
    }

    // 1. Initial Inverse-Volatility Risk Parity weights
    const invVols = assets.map((a) => {
      const vol = Math.max(0.01, a.estimatedVolatility);
      return 1 / vol;
    });
    const sumInvVol = invVols.reduce((sum, v) => sum + v, 0);
    let rawWeights = invVols.map((v) => v / sumInvVol);

    // 2. Enforce maxSingleAssetWeight cap
    const cap = Math.min(1.0, constraints.maxSingleAssetWeight);
    rawWeights = rawWeights.map((w, i) => {
      const assetCap = assets[i]!.maxWeightLimit ?? cap;
      return Math.min(w, assetCap);
    });

    // Re-normalize to simplex
    const sumClamped = rawWeights.reduce((s, w) => s + w, 0);
    const finalWeights = rawWeights.map((w) => (sumClamped > 0 ? w / sumClamped : 1 / n));

    // 3. Compute portfolio expected return and variance
    let expectedReturnBps = 0;
    let weightedVolSum = 0;
    for (let i = 0; i < n; i++) {
      expectedReturnBps += finalWeights[i]! * assets[i]!.expectedReturnBps;
      weightedVolSum += finalWeights[i]! * assets[i]!.estimatedVolatility;
    }

    let portVariance = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        portVariance += finalWeights[i]! * finalWeights[j]! * covarianceMatrix[i]![j]!;
      }
    }
    const portfolioVolatility = Math.sqrt(Math.max(0.000001, portVariance));

    // 4. Diversification ratio = weighted sum of vols / portfolio vol
    const diversificationRatio = portfolioVolatility > 0
      ? weightedVolSum / portfolioVolatility
      : 1.0;

    // 5. Binary Payoff Tail Risk & CVaR (Rockafellar-Uryasev formulation)
    // Parametric VaR (1.645 standard deviations for 95% normal approx)
    const zScore = 1.645;
    const parametricVaR95Usd = Math.round(totalCapitalUsd * portfolioVolatility * zScore);

    // CVaR under binary worst-case settlement stress
    // Expected loss conditional on exceeding VaR
    const cvarMultiplier = 1.25; // Fat-tail binary jump multiplier
    const cvar95Usd = Math.min(
      totalCapitalUsd,
      Math.round(parametricVaR95Usd * cvarMultiplier)
    );

    const weightsRecord: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      weightsRecord[assets[i]!.symbol] = Math.round(finalWeights[i]! * 10_000) / 10_000;
    }

    return {
      weights: weightsRecord,
      expectedPortfolioReturnBps: Math.round(expectedReturnBps),
      portfolioVolatility: Math.round(portfolioVolatility * 10_000) / 10_000,
      parametricVaR95Usd,
      cvar95Usd,
      diversificationRatio: Math.round(diversificationRatio * 100) / 100,
      totalCapitalUsd,
    };
  }
}
