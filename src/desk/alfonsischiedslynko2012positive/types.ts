/**
 * Wave 291 — Alfonsi, Schied & Slynko (2012): Order Book Resilience and Positive Portfolio Execution
 * Types & Configuration Interfaces
 */

export interface AlfonsiSchiedSlynko2012Config {
  readonly totalOrderSizeX0: number;
  readonly horizonSec: number;
  readonly gridStepsN: number;
  readonly fastResilienceRho1: number;
  readonly slowResilienceRho2: number;
  readonly fastWeightAlpha: number;
}

export interface AlfonsiSchiedSlynko2012Result {
  readonly discreteTrades: readonly number[];
  readonly minimumTradeWeight: number;
  readonly satisfiesPositivePortfolioProperty: boolean;
  readonly transientImpactEnergy: number;
}
