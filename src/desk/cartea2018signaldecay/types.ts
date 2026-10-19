export interface Cartea2018SignalDecayInput {
  readonly inventorySharesQ: number;
  readonly alphaSignalInitial: number;
  readonly signalDecayRateKappaAlpha: number;
  readonly inventoryUrgencyKappaInv: number;
  readonly temporaryImpactEta: number;
}

export interface Cartea2018SignalDecayOutput {
  readonly effectiveAlphaDiscountFactor: number;
  readonly alphaContributionRate: number;
  readonly inventoryLiquidationRate: number;
  readonly netOptimalTradingRate: number;
  readonly regime: 'SIGNAL_ACCELERATED' | 'SIGNAL_RETARDED' | 'PURE_INVENTORY';
}
