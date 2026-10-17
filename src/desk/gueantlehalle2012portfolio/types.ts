export interface GueantLehalleTapia2012PortfolioInput {
  readonly inventoryAsset1Shares: number;
  readonly inventoryAsset2Shares: number;
  readonly volatilityAsset1Usd: number;
  readonly volatilityAsset2Usd: number;
  readonly correlationRho12: number;
  readonly riskAversionGamma: number;
  readonly temporaryImpactEta1: number;
  readonly remainingHorizonSec: number;
}

export interface GueantLehalleTapia2012PortfolioOutput {
  readonly portfolioVarianceUsdSq: number;
  readonly coupledEffectiveInventory1: number;
  readonly decayRateOmega1PerSec: number;
  readonly optimalLiquidationRate1SharesPerSec: number;
  readonly hedgeState: 'CROSS_HEDGED_DAMPED' | 'UNCORRELATED_NEUTRAL' | 'DIRECTIONAL_AMPLIFIED';
}
