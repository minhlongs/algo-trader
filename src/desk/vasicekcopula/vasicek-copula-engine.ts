import { VasicekPortfolioConfig, VasicekPortfolioResult } from './vasicek-copula-types';
import { VasicekCopulaMath } from './vasicek-copula-math';

export class VasicekCopulaEngine {
  public evaluate(config: VasicekPortfolioConfig): VasicekPortfolioResult {
    this.validate(config);

    const p = config.defaultProbabilityPct / 100.0;
    const lgd = config.lossGivenDefaultPct / 100.0;
    const rho = config.assetCorrelation;
    const alpha = (config.confidenceLevelPct ?? 99.9) / 100.0;
    const ead = config.totalExposureUsd ?? 1_000_000;

    const expectedLossFrac = p * lgd;
    const varLossFrac = lgd * VasicekCopulaMath.lossQuantile(alpha, p, rho);
    const unexpectedLossFrac = Math.max(0, varLossFrac - expectedLossFrac);

    const esLossFrac = VasicekCopulaMath.computeExpectedShortfall(alpha, p, rho, lgd);
    const defaultThresholdScore = VasicekCopulaMath.defaultThreshold(p);

    const sample = VasicekCopulaMath.generateDistributionSample(p, rho);

    return {
      expectedLossPct: Number((expectedLossFrac * 100.0).toFixed(4)),
      expectedLossUsd: Number((expectedLossFrac * ead).toFixed(2)),
      creditVarPct: Number((varLossFrac * 100.0).toFixed(4)),
      creditVarUsd: Number((varLossFrac * ead).toFixed(2)),
      unexpectedLossPct: Number((unexpectedLossFrac * 100.0).toFixed(4)),
      unexpectedLossUsd: Number((unexpectedLossFrac * ead).toFixed(2)),
      expectedShortfallPct: Number((esLossFrac * 100.0).toFixed(4)),
      expectedShortfallUsd: Number((esLossFrac * ead).toFixed(2)),
      economicCapitalRatioPct: Number((unexpectedLossFrac * 100.0).toFixed(4)),
      defaultThresholdScore: Number(defaultThresholdScore.toFixed(4)),
      distributionSample: sample,
    };
  }

  private validate(config: VasicekPortfolioConfig): void {
    if (config.defaultProbabilityPct <= 0 || config.defaultProbabilityPct >= 100) {
      throw new Error('Default probability must be strictly between 0 and 100%');
    }
    if (config.lossGivenDefaultPct <= 0 || config.lossGivenDefaultPct > 100) {
      throw new Error('Loss Given Default must be in (0, 100]%');
    }
    if (config.assetCorrelation <= 0 || config.assetCorrelation >= 1) {
      throw new Error('Asset correlation rho must be strictly in (0, 1)');
    }
    if (config.confidenceLevelPct !== undefined) {
      if (config.confidenceLevelPct <= 50 || config.confidenceLevelPct >= 100) {
        throw new Error('Confidence level must be between 50% and 100%');
      }
    }
  }
}
