/**
 * Type definitions for Cont, Kukanov & Stoikov (2014) Multi-Depth OFI.
 * Strictly < 100 LOC, zero :any.
 */

export interface OrderBookLevel {
  readonly price: number;
  readonly size: number;
}

export interface OrderBookSnapshot {
  readonly timestamp: number;
  readonly bids: readonly OrderBookLevel[]; // Sorted descending by price [level 1, 2, ..., K]
  readonly asks: readonly OrderBookLevel[]; // Sorted ascending by price [level 1, 2, ..., K]
}

export interface LevelOfiContribution {
  readonly level: number;
  readonly bidFlow: number;
  readonly askFlow: number;
  readonly ofi: number;
  readonly weight: number;
}

export interface MultiOfiResult {
  readonly timestamp: number;
  readonly depthK: number;
  readonly levelContributions: readonly LevelOfiContribution[];
  readonly integratedOfi: number;
  readonly midquoteChange: number;
  readonly predictedPriceImpact: number;
}

export interface MultiOfiConfig {
  readonly depthLevels: number; // Number of book levels K (e.g. 5)
  readonly decayLambda: number; // Spatial decay parameter lambda (e.g. 0.5)
}
