/**
 * Wave 273 — Bouchaud, Gefen, Potters & Wyart (2004): Fluctuations and Response in Financial Markets
 * Types & Configuration Interfaces
 */

export interface Bouchaud2004ResponseConfig {
  readonly maxLag: number;
  readonly bareImpactGamma0: number;
  readonly lagOffsetL0: number;
  readonly propagatorDecayBeta: number;
  readonly signAutocorrC0: number;
  readonly signDecayGamma: number;
  readonly uncorrNoiseSigma2: number;
}

export interface LagResponsePoint {
  readonly lag: number;
  readonly barePropagatorG0: number;
  readonly signAutocorrelationC: number;
  readonly priceResponseR: number;
  readonly lagDiffusivityD: number;
}

export interface Bouchaud2004ResponseResult {
  readonly curve: readonly LagResponsePoint[];
  readonly criticalBetaExponent: number;
  readonly isDiffusiveBalanced: boolean;
  readonly terminalResponseRatio: number;
}
