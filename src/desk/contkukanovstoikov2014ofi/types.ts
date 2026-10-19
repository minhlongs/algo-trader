/**
 * Wave 285 — Cont, Kukanov & Stoikov (2014): The Price Impact of Order Book Events (OFI)
 * Types & Configuration Interfaces
 */

export interface L1BookSnapshot {
  readonly bidPrice: number;
  readonly bidSize: number;
  readonly askPrice: number;
  readonly askSize: number;
}

export interface Cont2014OfiConfig {
  readonly snapshots: readonly L1BookSnapshot[];
  readonly baselineMarketDepthD: number;
}

export interface OfiEventStep {
  readonly index: number;
  readonly eventContributionEn: number;
  readonly midPriceChange: number;
}

export interface Cont2014OfiResult {
  readonly steps: readonly OfiEventStep[];
  readonly cumulativeOfi: number;
  readonly impactCoefficientBeta: number;
  readonly predictedMidPriceDelta: number;
}
