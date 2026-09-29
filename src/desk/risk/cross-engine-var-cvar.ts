import { inverseNormalCdf } from '../../alpha-lab/validation/stats-math';
import type { PositionRisk, VarCvarResult } from './portfolio-risk-types';

export function acklamNormalQuantile(confidence: number): number {
  if (confidence <= 0 || confidence >= 1) {
    throw new RangeError(`Confidence must be strictly between 0 and 1, got ${confidence}`);
  }
  return inverseNormalCdf(confidence);
}

export function normalPdf(z: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
}

export function computeVarCvar(
  returns: readonly number[],
  portfolioNav: number,
  confidence: 0.95 | 0.99 = 0.95,
  horizonDays = 1
): VarCvarResult {
  const z = acklamNormalQuantile(confidence);
  const sqrtH = Math.sqrt(Math.max(horizonDays, 1e-4));
  const n = returns.length;

  if (n < 5 || portfolioNav <= 0) {
    const defaultLoss = Math.max(0, portfolioNav * 0.02 * sqrtH);
    return {
      parametricVaR: defaultLoss,
      parametricCVaR: defaultLoss * 1.25,
      historicalVaR: defaultLoss,
      historicalCVaR: defaultLoss * 1.25,
      confidence,
      horizonDays,
      portfolioNav,
    };
  }

  const validReturns = returns.map((r) => (Number.isFinite(r) ? r : 0));
  const mean = validReturns.reduce((sum, r) => sum + r, 0) / n;
  const variance = validReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(Math.max(variance, 1e-8));

  const parametricVaR = Math.max(0, (z * sigma - mean) * portfolioNav * sqrtH);
  const phiZ = normalPdf(z);
  const parametricCVaR = Math.max(
    parametricVaR,
    (sigma * (phiZ / (1 - confidence)) - mean) * portfolioNav * sqrtH
  );

  const sorted = [...validReturns].sort((a, b) => a - b);
  const cutoffIndex = Math.max(0, Math.floor((1 - confidence) * n));
  const historicalVaR = Math.max(0, -sorted[cutoffIndex] * portfolioNav * sqrtH);

  const tailLosses = sorted.slice(0, cutoffIndex + 1);
  const avgTailLoss =
    tailLosses.length > 0 ? tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length : sorted[0];
  const historicalCVaR = Math.max(historicalVaR, -avgTailLoss * portfolioNav * sqrtH);

  return {
    parametricVaR,
    parametricCVaR,
    historicalVaR,
    historicalCVaR,
    confidence,
    horizonDays,
    portfolioNav,
  };
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

export function computeMultiAssetVarCvar(
  weights: readonly number[],
  covarianceMatrix: readonly (readonly number[])[],
  portfolioNav: number,
  confidence: 0.95 | 0.99 = 0.95,
  horizonDays = 1,
  assetReturns?: readonly (readonly number[])[]
): VarCvarResult {
  const z = acklamNormalQuantile(confidence);
  const sqrtH = Math.sqrt(Math.max(horizonDays, 1e-4));
  const sigmaP = computePortfolioParametricSigma(weights, covarianceMatrix);

  const parametricVaR = Math.max(0, z * sigmaP * portfolioNav * sqrtH);
  const phiZ = normalPdf(z);
  const parametricCVaR = Math.max(
    parametricVaR,
    sigmaP * (phiZ / (1 - confidence)) * portfolioNav * sqrtH
  );

  if (!assetReturns || assetReturns.length === 0 || assetReturns[0].length === 0) {
    return {
      parametricVaR,
      parametricCVaR,
      historicalVaR: parametricVaR,
      historicalCVaR: parametricCVaR,
      confidence,
      horizonDays,
      portfolioNav,
    };
  }

  const numObs = Math.min(...assetReturns.map((r) => r.length));
  const portfolioReturns: number[] = [];
  for (let t = 0; t < numObs; t++) {
    let r_p = 0;
    for (let i = 0; i < weights.length; i++) {
      r_p += weights[i] * (assetReturns[i][t] ?? 0);
    }
    portfolioReturns.push(r_p);
  }

  const histResult = computeVarCvar(portfolioReturns, portfolioNav, confidence, horizonDays);
  return {
    parametricVaR,
    parametricCVaR,
    historicalVaR: histResult.historicalVaR,
    historicalCVaR: histResult.historicalCVaR,
    confidence,
    horizonDays,
    portfolioNav,
  };
}

export class CrossEngineVarCvarCalculator {
  public calculate(
    returns: readonly number[],
    portfolioNav: number,
    confidence: 0.95 | 0.99 = 0.95,
    horizonDays = 1
  ): VarCvarResult {
    return computeVarCvar(returns, portfolioNav, confidence, horizonDays);
  }

  public calculateFromPositions(
    positions: readonly PositionRisk[],
    covarianceMatrix: readonly (readonly number[])[],
    portfolioNav: number,
    confidence: 0.95 | 0.99 = 0.95,
    horizonDays = 1,
    assetReturns?: readonly (readonly number[])[]
  ): VarCvarResult {
    const totalGross = positions.reduce((s, p) => s + Math.abs(p.notionalUsd), 0);
    const weights = positions.map((p) =>
      totalGross > 0 ? p.notionalUsd / Math.max(portfolioNav, totalGross) : 0
    );
    return computeMultiAssetVarCvar(
      weights,
      covarianceMatrix,
      portfolioNav,
      confidence,
      horizonDays,
      assetReturns
    );
  }
}
