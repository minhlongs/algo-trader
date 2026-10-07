/**
 * Value-at-Risk Monte Carlo Engine Types
 *
 * Contracts for portfolio terminal resolution simulations,
 * VaR 95/99% estimation, and Expected Shortfall (CVaR).
 *
 * @module desk/risk/var-monte-carlo-types
 */

export interface ContractPosition {
  readonly marketId: string;
  readonly outcome: 'YES' | 'NO';
  readonly quantity: number;
  readonly currentPrice: number; // in [0, 1]
}

export interface MonteCarloVaRConfig {
  readonly simulationRuns?: number;
  readonly confidenceLevels?: readonly number[]; // e.g. [0.95, 0.99]
}

export interface MonteCarloVaRReport {
  readonly portfolioNotionalUsd: number;
  readonly simulationRuns: number;
  readonly var95Usd: number;
  readonly var99Usd: number;
  readonly cvar95Usd: number; // Expected Shortfall at 95%
  readonly cvar99Usd: number; // Expected Shortfall at 99%
  readonly worstCaseLossUsd: number;
  readonly probabilityOfTotalLossPct: number;
}
