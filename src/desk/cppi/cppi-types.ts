export interface CppiParameters {
  readonly initialPortfolioValueUsd: number;
  readonly floorGuaranteeFraction: number; // e.g. 0.90 (90% principal protection)
  readonly multiplierM: number;            // Leverage multiplier e.g. 4.0
  readonly riskFreeRatePct: number;
  readonly timeHorizonYears: number;
}

export interface CppiStepState {
  readonly timeYears: number;
  readonly portfolioValueUsd: number;
  readonly floorValueUsd: number;
  readonly cushionUsd: number;
  readonly riskyAllocationUsd: number;
  readonly riskFreeAllocationUsd: number;
  readonly isFloorBreached: boolean;
  readonly isCashedOut: boolean;
}

export interface CppiSimulationSummary {
  readonly initialPortfolioValueUsd: number;
  readonly finalPortfolioValueUsd: number;
  readonly minimumObservedCushionUsd: number;
  readonly states: CppiStepState[];
}
