/**
 * Black-Litterman Portfolio Asset Allocation Desk Types
 *
 * @module desk/blacklitterman/black-litterman-types
 */

export interface MarketPriorInputs {
  readonly assetSymbols: string[];
  readonly marketCapsUsd: number[];
  readonly covarianceMatrix: number[][];
  readonly riskAversionLambda: number; // e.g. 2.5
}

export interface InvestorView {
  readonly description: string;
  readonly pickVectorP: number[]; // Row vector specifying absolute or relative weights
  readonly expectedViewReturnQ: number; // View expected excess return
  readonly viewConfidenceVarianceOmega: number; // Diagonal uncertainty entry
}

export interface BlackLittermanResult {
  readonly assetSymbols: string[];
  readonly impliedPriorReturns: number[]; // Pi = lambda * Sigma * w_mkt
  readonly posteriorReturns: number[]; // Blended expected returns E[R]
  readonly optimalWeights: number[]; // w* from posterior
  readonly activeWeightTilts: number[]; // w* - w_mkt
}
