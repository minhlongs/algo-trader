/**
 * Price Impact Model Contracts
 * Kyle's Lambda permanent impact and Almgren-Chriss temporary friction types.
 *
 * @module desk/simulation/kyle-lambda-impact-types
 */

export interface TradeTick {
  readonly signedVolume: number; // Positive = buyer-initiated, Negative = seller-initiated
  readonly priceChange: number;  // Delta P
  readonly timestampMs: number;
}

export interface PriceImpactMetrics {
  readonly permanentImpactBps: number;
  readonly temporaryImpactBps: number;
  readonly totalExpectedSlippageBps: number;
  readonly lambda: number;
  readonly rSquared: number;
  readonly sampleCount: number;
}

export interface ImpactModelConfig {
  readonly halfSpreadBps?: number;
  readonly temporaryEta?: number;
  readonly decayFactor?: number; // Recursive OLS forgetting factor (0.95 - 0.99)
  readonly minSamples?: number;
}
