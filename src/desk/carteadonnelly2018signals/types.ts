/**
 * Wave 275 — Cartea, Donnelly & Jaimungal (2018): Enhancing Trading Strategies with Order Book Signals
 * Types & Configuration Interfaces
 */

export interface LevelDepthQuote {
  readonly bidVolume: number;
  readonly askVolume: number;
}

export interface CarteaDonnelly2018Config {
  readonly levels: readonly LevelDepthQuote[];
  readonly depthDecayAlpha: number;
  readonly signalDriftKappa: number;
  readonly temporaryImpactEta: number;
  readonly baselineLiquidationRate: number;
}

export interface CarteaDonnelly2018Result {
  readonly multiLevelImbalance: number;
  readonly levelWeights: readonly number[];
  readonly expectedShortTermDrift: number;
  readonly signalAdjustedTradingRate: number;
  readonly executionUrgencyMultiplier: number;
}
