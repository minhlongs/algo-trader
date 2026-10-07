/**
 * Correlated Resolution Stress Tester Types
 *
 * Contracts for multi-market deterministic resolution shocks,
 * systemic cascade loss quantification, and capital buffer sufficiency.
 *
 * @module desk/risk/correlated-resolution-types
 */

export interface MarketPositionEntry {
  readonly marketId: string;
  readonly outcome: 'YES' | 'NO';
  readonly quantity: number;
  readonly markPrice: number;
}

export interface ResolutionStressScenario {
  readonly scenarioName: string;
  readonly description: string;
  readonly forcedResolutions: Readonly<Record<string, 'YES' | 'NO'>>;
}

export interface ScenarioImpactResult {
  readonly scenarioName: string;
  readonly preStressNotionalUsd: number;
  readonly postStressTerminalValueUsd: number;
  readonly netStressLossUsd: number;
  readonly lossPercentagePct: number;
  readonly isCapitalBufferBreached: boolean;
  readonly unaffectedMarketsCount: number;
}

export interface PortfolioStressAssessment {
  readonly availableCapitalBufferUsd: number;
  readonly worstScenarioName: string;
  readonly maxDrawdownUsd: number;
  readonly scenarioResults: readonly ScenarioImpactResult[];
}
