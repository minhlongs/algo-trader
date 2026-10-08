/**
 * Microstructure Signal Synthesizer Types
 *
 * @module desk/microstructure/microstructure-types
 */

export interface RollSpreadEstimate {
  readonly symbol: string;
  readonly sampleCount: number;
  readonly autocovariance: number;
  readonly effectiveSpread: number;
  readonly effectiveSpreadBps: number;
}

export interface HasbrouckInformationShare {
  readonly leadVenue: string;
  readonly followVenue: string;
  readonly leadInformationSharePct: number;
  readonly followInformationSharePct: number;
  readonly permanentPriceVariance: number;
}

export interface BookLevel {
  readonly price: number;
  readonly size: number;
}

export interface MultiLevelOrderBook {
  readonly symbol: string;
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
  readonly timestampMs: number;
}

export interface MicroPriceEstimate {
  readonly midPrice: number;
  readonly microPrice: number;
  readonly queueImbalance: number;
  readonly spreadBps: number;
  readonly volumeWeightedMidQuote: number;
}
