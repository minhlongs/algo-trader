export interface Cartea2017TikhonovInput {
  readonly inventorySharesQ: number;
  readonly temporaryImpactEta: number;
  readonly riskAversionPhi: number;
  readonly ambiguityPenaltyLambda: number;
  readonly rawDriftSignalAlpha: number;
  readonly signalVarianceSigmaSq: number;
  readonly remainingHorizonSecT: number;
}

export interface Cartea2017TikhonovOutput {
  readonly regularizedUrgencyKappa: number;
  readonly shrinkageFactor: number;
  readonly filteredAlphaSignal: number;
  readonly optimalLiquidationRateSharesPerSec: number;
  readonly regime: 'AMBIGUITY_DAMPED' | 'ALPHA_DRIVEN' | 'INVENTORY_URGENT';
}
