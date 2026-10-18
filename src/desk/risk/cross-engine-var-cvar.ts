import type { PositionRisk, VarCvarResult } from './portfolio-risk-types';
import {
  acklamNormalQuantile,
  normalPdf,
  computePortfolioParametricSigma,
  aggregateWeightedAssetReturns,
} from './cross-engine-var-cvar-math';

export {
  acklamNormalQuantile,
  normalPdf,
  computePortfolioParametricSigma,
  aggregateWeightedAssetReturns,
};

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

  const portfolioReturns = aggregateWeightedAssetReturns(weights, assetReturns);
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
