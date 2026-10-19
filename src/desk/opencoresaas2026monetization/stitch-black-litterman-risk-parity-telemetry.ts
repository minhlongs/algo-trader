// SPDX-License-Identifier: MIT
/**
 * Stitch Screen #19 — Black-Litterman Posterior Returns & Equal Risk Contribution.
 * Powers `site/public/black-litterman-risk-parity-cockpit.html` and
 * `GET /api/v1/stitch-cockpit/black-litterman-risk-parity`.
 */

import { BlackLittermanBlender } from '../blacklitterman/black-litterman-blender';
import type { InvestorView, MarketPriorInputs } from '../blacklitterman/black-litterman-types';
import { RiskParityOptimizer } from '../portfolio/risk-parity-optimizer';

export interface BlackLittermanRiskParityAsset {
  readonly symbol: string;
  readonly marketWeightPct: number;
  readonly priorReturnPct: number;
  readonly posteriorReturnPct: number;
  readonly blWeightPct: number;
  readonly activeTiltPct: number;
  readonly riskParityWeightPct: number;
  readonly marginalRiskContribution: number;
  readonly totalRiskContributionPct: number;
}

export interface BlackLittermanRiskParityView {
  readonly description: string;
  readonly expectedViewReturnPct: number;
  readonly confidenceVariance: number;
}

export interface BlackLittermanRiskParitySnapshot {
  readonly screenId: 'code-authored-screen-19';
  readonly file: 'site/public/black-litterman-risk-parity-cockpit.html';
  readonly assets: readonly BlackLittermanRiskParityAsset[];
  readonly views: readonly BlackLittermanRiskParityView[];
  readonly summary: {
    readonly riskAversionLambda: number;
    readonly tau: number;
    readonly portfolioVolatilityPct: number;
    readonly maxRiskContributionDisparityPct: number;
    readonly converged: boolean;
    readonly iterations: number;
  };
}

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB'] as const;
const MARKET_CAPS = [1_300_000, 400_000, 80_000, 60_000];
const VOLS = [0.35, 0.45, 0.65, 0.55];
const CORR = [
  [1.0, 0.7, 0.6, 0.5],
  [0.7, 1.0, 0.65, 0.55],
  [0.6, 0.65, 1.0, 0.6],
  [0.5, 0.55, 0.6, 1.0],
];

const covariance = VOLS.map((vi, i) => VOLS.map((vj, j) => Number((vi * vj * CORR[i]![j]!).toFixed(6))));

const VIEWS: readonly InvestorView[] = [
  {
    description: 'ETH outperforms BTC by 5%',
    pickVectorP: [-1, 1, 0, 0],
    expectedViewReturnQ: 0.05,
    viewConfidenceVarianceOmega: 0.02,
  },
  {
    description: 'SOL underperforms by 3%',
    pickVectorP: [0, 0, 1, 0],
    expectedViewReturnQ: -0.03,
    viewConfidenceVarianceOmega: 0.04,
  },
];

export function buildBlackLittermanRiskParitySnapshot(
  riskAversionLambda = 1.2,
  tau = 0.05,
): BlackLittermanRiskParitySnapshot {
  const inputs: MarketPriorInputs = {
    assetSymbols: [...SYMBOLS],
    marketCapsUsd: MARKET_CAPS,
    covarianceMatrix: covariance,
    riskAversionLambda,
  };
  const bl = new BlackLittermanBlender().blendViews(inputs, [...VIEWS], tau);
  const rp = new RiskParityOptimizer().optimizeEqualRiskContribution(covariance);
  const totalCap = MARKET_CAPS.reduce((a, b) => a + b, 0);
  const portVol = rp.portfolioVolatilityPct / 100;

  const assets: readonly BlackLittermanRiskParityAsset[] = SYMBOLS.map((symbol, i) => ({
    symbol,
    marketWeightPct: Number(((MARKET_CAPS[i]! / totalCap) * 100).toFixed(2)),
    priorReturnPct: Number((bl.impliedPriorReturns[i]! * 100).toFixed(3)),
    posteriorReturnPct: Number((bl.posteriorReturns[i]! * 100).toFixed(3)),
    blWeightPct: Number((bl.optimalWeights[i]! * 100).toFixed(2)),
    activeTiltPct: Number((bl.activeWeightTilts[i]! * 100).toFixed(2)),
    riskParityWeightPct: Number((rp.weights[i]! * 100).toFixed(2)),
    marginalRiskContribution: rp.marginalRiskContributions[i]!,
    totalRiskContributionPct: Number(((rp.totalRiskContributions[i]! / portVol) * 100).toFixed(2)),
  }));

  return {
    screenId: 'code-authored-screen-19',
    file: 'site/public/black-litterman-risk-parity-cockpit.html',
    assets,
    views: VIEWS.map((v) => ({
      description: v.description,
      expectedViewReturnPct: Number((v.expectedViewReturnQ * 100).toFixed(2)),
      confidenceVariance: v.viewConfidenceVarianceOmega,
    })),
    summary: {
      riskAversionLambda,
      tau,
      portfolioVolatilityPct: rp.portfolioVolatilityPct,
      maxRiskContributionDisparityPct: rp.maxDisparityPct,
      converged: rp.converged,
      iterations: rp.iterations,
    },
  };
}
