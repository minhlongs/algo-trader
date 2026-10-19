export interface CarteaJaimungal2016PermanentInput {
  readonly inventorySharesQ: number;
  readonly remainingHorizonSeconds: number;
  readonly temporaryImpactK: number;
  readonly permanentImpactB: number;
  readonly terminalPenaltyAlpha: number;
  readonly runningPenaltyPhi: number;
}

export interface CarteaJaimungal2016PermanentOutput {
  readonly characteristicKappa: number;
  readonly effectiveTerminalZeta: number;
  readonly optimalLiquidationRateNu: number;
  readonly permanentPriceDropExpected: number;
  readonly wellPosedConvexityCondition: boolean;
  readonly regime: 'WELL_POSED_HYPERBOLIC_DECAY' | 'HIGH_PERMANENT_IMPACT_DRIFT' | 'DEGENERATE_PENALTY_GUARD';
}
