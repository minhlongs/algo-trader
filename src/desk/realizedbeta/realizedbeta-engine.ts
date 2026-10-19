/**
 * Wave 209: Andersen, Bollerslev, Diebold & Wu (2006) Realized Beta Engine.
 * Evaluates high-frequency continuous and jump beta decomposition.
 * Strictly < 180 LOC, zero :any.
 */

import { RealizedBetaConfig, RealizedBetaResult } from './realizedbeta-types';
import { RealizedBetaMath } from './realizedbeta-math';

export class RealizedBetaEngine {
  private readonly config: RealizedBetaConfig;

  constructor(config?: Partial<RealizedBetaConfig>) {
    this.config = {
      annualizationFactor: config?.annualizationFactor ?? 252.0,
      minObservations: config?.minObservations ?? 2,
      shrinkageIntensity: config?.shrinkageIntensity ?? 0.0,
    };
  }

  /**
   * Evaluates realized beta and decomposes into continuous and jump components.
   */
  public evaluate(assetReturns: number[], marketReturns: number[]): RealizedBetaResult {
    const n = Math.min(assetReturns.length, marketReturns.length);
    if (n < (this.config.minObservations ?? 2)) {
      throw new Error(`Insufficient return observations (${n}) for realized beta estimation.`);
    }

    const { rcov, rvAsset, rvMarket, corr } = RealizedBetaMath.calculateRealizedMoments(
      assetReturns,
      marketReturns
    );

    const bvMarket = RealizedBetaMath.calculateBipowerVariation(marketReturns);
    const bvAsset = RealizedBetaMath.calculateBipowerVariation(assetReturns);
    const bcov = RealizedBetaMath.calculateBipowerCovariance(assetReturns, marketReturns);

    // Total Realized Beta: beta = RCov / RV_m
    const rawTotalBeta = rvMarket > 1e-12 ? rcov / rvMarket : 1.0;
    // Shrinkage towards 1.0 (Vasicek shrinkage)
    const lambda = Math.max(0.0, Math.min(1.0, this.config.shrinkageIntensity ?? 0.0));
    const totalBeta = (1.0 - lambda) * rawTotalBeta + lambda * 1.0;

    // Continuous Beta: beta_c = BCOV / BV_m
    const continuousBeta = bvMarket > 1e-12 ? bcov / bvMarket : totalBeta;

    // Jump Beta: beta_j from jump covariance and jump market variance
    const jumpCov = rcov - bcov;
    const jumpMarketVar = Math.max(0.0, rvMarket - bvMarket);
    const jumpBeta = jumpMarketVar > 1e-12 ? jumpCov / jumpMarketVar : continuousBeta;

    // Systemic Risk fraction & Idiosyncratic Variance
    const systemicVar = (totalBeta * totalBeta) * rvMarket;
    const systemicRiskFraction = rvAsset > 1e-12 ? Math.min(1.0, systemicVar / rvAsset) : 0.0;
    const idiosyncraticVariance = Math.max(0.0, rvAsset - systemicVar);

    let regime: RealizedBetaResult['betaRegime'] = 'NEUTRAL';
    if (totalBeta > 1.2) {
      regime = 'AGGRESSIVE';
    } else if (totalBeta < 0.8) {
      regime = 'DEFENSIVE';
    }

    return {
      sampleSize: n,
      realizedMarketVariance: rvMarket,
      realizedAssetVariance: rvAsset,
      realizedCovariance: rcov,
      realizedCorrelation: corr,
      totalRealizedBeta: totalBeta,
      continuousBeta,
      jumpBeta,
      marketBipowerVariation: bvMarket,
      assetBipowerVariation: bvAsset,
      bipowerCovariance: bcov,
      systemicRiskFraction,
      idiosyncraticVariance,
      betaRegime: regime,
    };
  }
}
