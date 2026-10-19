export interface Gueant2015MultiAssetLiqInput {
  readonly inventoryAsset1Shares: number;
  readonly inventoryAsset2Shares: number;
  readonly volAsset1Usd: number;
  readonly volAsset2Usd: number;
  readonly correlationRho: number;
  readonly riskAversionGamma: number;
  readonly intensityDecayKappa: number;
}

export interface Gueant2015MultiAssetLiqOutput {
  readonly portfolioVarianceDollarSq: number;
  readonly marginalRiskGradientAsset1: number;
  readonly optimalAskOffsetAsset1Usd: number;
  readonly optimalBidOffsetAsset1Usd: number;
  readonly reservationSkewUsd: number;
  readonly regime: 'CROSS_HEDGED' | 'UNHEDGED_CONCENTRATED' | 'NEUTRAL_BALANCED';
}
