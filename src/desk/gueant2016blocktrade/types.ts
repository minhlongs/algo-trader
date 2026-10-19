export interface Gueant2016BlockTradeInput {
  readonly blockSizeSharesQ: number;
  readonly referenceMidPriceS0: number;
  readonly permanentImpactGamma: number;
  readonly temporaryImpactEta: number;
  readonly riskAversionLambda: number;
  readonly dailyVolatilityDollarSigma: number;
}

export interface Gueant2016BlockTradeOutput {
  readonly permanentImpactCostPerShare: number;
  readonly executionRiskPremiumPerShare: number;
  readonly totalBlockDiscountPerShare: number;
  readonly guaranteedBlockBidPrice: number;
  readonly discountBasisPoints: number;
  readonly regime: 'TIGHT_INSTITUTIONAL_BLOCK' | 'ELEVATED_RISK_LIQUIDITY_CHARGE' | 'EXTREME_ILLIQUIDITY_DISCOUNT';
}
