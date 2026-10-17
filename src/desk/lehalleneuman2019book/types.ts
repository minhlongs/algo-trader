/**
 * Wave 265: Lehalle & Neuman (2019) Incorporating the Order Book Feature in Optimal Execution Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface LehalleNeuman2019Config {
  readonly initialInventory: number; // Q_0
  readonly executionHorizon: number; // T
  readonly steps: number; // N
  readonly temporaryImpactEta: number; // eta > 0
  readonly permanentImpactGamma: number; // gamma_perm >= 0
  readonly riskAversionPhi: number; // phi >= 0
  readonly orderBookImbalanceBeta: number; // beta: sensitivity of drift to queue imbalance
}

export interface BookImbalanceStep {
  readonly step: number;
  readonly time: number;
  readonly inventory: number; // q(t)
  readonly tradingRate: number; // nu(t)
  readonly queueImbalance: number; // I(t) in [-1, 1]
  readonly expectedAlphaDrift: number; // beta * I(t)
}

export interface LehalleNeuman2019Result {
  readonly trajectory: readonly BookImbalanceStep[];
  readonly totalExecutionCost: number;
  readonly terminalInventory: number;
  readonly averageTradingRate: number;
  readonly netDriftBenefit: number;
}
