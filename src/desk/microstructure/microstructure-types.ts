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

export interface TradeExecution {
  price: number;
  size: number;
  timestampMs: number;
}

export interface VolumeBucket {
  bucketIndex: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  orderImbalance: number; // |V_B - V_S|
}

export interface VpinMetrics {
  vpin: number; // Probability of toxicity in [0, 1]
  bucketCount: number;
  bucketSize: number;
  averageAbsImbalance: number;
  toxicityRegime: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

export interface Level2OrderBook {
  timestampMs: number;
  bids: { price: number; size: number }[]; // Ranked best bid first
  asks: { price: number; size: number }[]; // Ranked best ask first
}

export interface OrderFlowImbalanceSignal {
  timestampMs: number;
  ofiContracts: number;
  bestBidPrice: number;
  bestAskPrice: number;
  spread: number;
  depthImbalanceRatio: number; // (BidSize - AskSize) / (BidSize + AskSize)
  depletionAlert: boolean;
}
