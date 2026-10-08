/**
 * Idiosyncratic Risk & Variance Decomposer
 * Splits total empirical variance into factor-driven systematic variance and unhedged specific risk.
 *
 * @module desk/factor/idiosyncratic-risk-decomposer
 */

import { FactorExposureVector, IdiosyncraticRiskDecomposition } from './factor-types';

export class IdiosyncraticRiskDecomposer {
  public decomposeVariance(
    exposure: FactorExposureVector,
    factorCovariances: Record<string, number>,
    totalAssetVariance: number
  ): IdiosyncraticRiskDecomposition {
    const marketVar = exposure.marketBeta * exposure.marketBeta * (factorCovariances['market'] ?? 0.04);
    const sizeVar = exposure.sizeFactor * exposure.sizeFactor * (factorCovariances['size'] ?? 0.01);
    const valueVar = exposure.valueFactor * exposure.valueFactor * (factorCovariances['value'] ?? 0.01);
    const momVar = exposure.momentumFactor * exposure.momentumFactor * (factorCovariances['momentum'] ?? 0.015);

    const systematicVariance = marketVar + sizeVar + valueVar + momVar;
    const specificVariance = Math.max(0.0001, totalAssetVariance - systematicVariance);
    const rSquared = Math.min(1.0, systematicVariance / Math.max(1e-6, totalAssetVariance));

    return {
      asset: exposure.asset,
      totalVariance: Number(totalAssetVariance.toFixed(6)),
      systematicVariance: Number(systematicVariance.toFixed(6)),
      specificVariance: Number(specificVariance.toFixed(6)),
      rSquared: Number(rSquared.toFixed(4)),
    };
  }
}
