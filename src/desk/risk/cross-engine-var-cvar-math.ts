/**
 * Cross-Engine VaR & CVaR Pure Math Helpers
 */

import { inverseNormalCdf } from '../../alpha-lab/validation/stats-math';

export function acklamNormalQuantile(confidence: number): number {
  if (confidence <= 0 || confidence >= 1) {
    throw new RangeError(`Confidence must be strictly between 0 and 1, got ${confidence}`);
  }
  return inverseNormalCdf(confidence);
}

export function normalPdf(z: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
}

export function computePortfolioParametricSigma(
  weights: readonly number[],
  covarianceMatrix: readonly (readonly number[])[]
): number {
  const n = weights.length;
  if (n === 0 || covarianceMatrix.length !== n) return 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      variance += weights[i] * weights[j] * (covarianceMatrix[i][j] ?? 0);
    }
  }
  return Math.sqrt(Math.max(variance, 1e-12));
}

export function aggregateWeightedAssetReturns(
  weights: readonly number[],
  assetReturns: readonly (readonly number[])[]
): number[] {
  const numObs = Math.min(...assetReturns.map((r) => r.length));
  const portfolioReturns: number[] = [];
  for (let t = 0; t < numObs; t++) {
    let rP = 0;
    for (let i = 0; i < weights.length; i++) {
      rP += weights[i] * (assetReturns[i][t] ?? 0);
    }
    portfolioReturns.push(rP);
  }
  return portfolioReturns;
}
