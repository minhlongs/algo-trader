/**
 * Wave 283 — Alfonsi, Fruth & Schied (2010): Optimal Execution in Limit Order Books with General Shape Functions
 * Types & Configuration Interfaces
 */

export interface Alfonsi2010ShapeConfig {
  readonly initialInventoryX0: number;
  readonly horizonSec: number;
  readonly numIntermediateBlocksN: number;
  readonly resilienceRateRho: number;
  readonly bookDensityAlpha: number;
  readonly shapeExponentBeta: number;
}

export interface DiscreteBlockTrade {
  readonly blockIndex: number;
  readonly timeSec: number;
  readonly tradeSize: number;
  readonly postTradePriceDisplacement: number;
}

export interface Alfonsi2010ShapeResult {
  readonly blocks: readonly DiscreteBlockTrade[];
  readonly initialBlockRatio: number;
  readonly terminalBlockRatio: number;
  readonly totalNonlinearImpactCost: number;
}
