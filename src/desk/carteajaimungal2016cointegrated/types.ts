export interface CarteaJaimungal2016CointegratedInput {
  readonly currentSpreadX: number;
  readonly equilibriumTheta: number;
  readonly meanReversionKappa: number;
  readonly currentInventoryQ: number;
  readonly temporaryImpactK: number;
  readonly runningInventoryPenaltyPhi: number;
  readonly remainingHorizonSeconds: number;
}

export interface CarteaJaimungal2016CointegratedOutput {
  readonly spreadMispricingDelta: number;
  readonly halfLifeSeconds: number;
  readonly meanReversionSignalRate: number;
  readonly inventoryDampingRate: number;
  readonly optimalSpreadTradingRateNu: number;
  readonly regime:
    | 'CONVERGENCE_ALPHA_ENTRY'
    | 'INVENTORY_UNWIND_DOMINANT'
    | 'NEUTRAL_EQUILIBRIUM_BAND';
}
