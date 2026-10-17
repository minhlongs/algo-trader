/**
 * Wave 282 — Gatheral (2010): No-Dynamic-Arbitrage and Market Impact
 * Types & Configuration Interfaces
 */

export interface Gatheral2010NoDarbConfig {
  readonly impactConcavityDelta: number;
  readonly kernelDecayGamma: number;
  readonly roundTripVolumeV: number;
  readonly impactScaleEta: number;
}

export interface Gatheral2010NoDarbResult {
  readonly exponentSum: number;
  readonly isNoDynamicArbitrageAdmissible: boolean;
  readonly isSquareRootSpecialCase: boolean;
  readonly roundTripExpectedCost: number;
  readonly manipulationVulnerabilityFlag: boolean;
}
