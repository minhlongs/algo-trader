/**
 * Order Book Microstructure Engine Types
 *
 * Types for high-frequency order flow imbalance, micro-price, and toxicity analytics.
 *
 * @module desk/data/orderbook-microstructure-types
 */

export interface MicrostructureQuote {
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly bidSize: number;
  readonly askSize: number;
  readonly timestamp: number;
}

export interface MicrostructureMetrics {
  readonly marketId: string;
  readonly timestamp: number;
  readonly midPrice: number;
  readonly microPrice: number;
  readonly spread: number;
  readonly orderFlowImbalance: number; // instantaneous OFI
  readonly rollingOfi: number;
  readonly vpinToxicity: number; // [0, 1] toxicity score
  readonly isAdverseSelectionRisk: boolean;
}

export interface MicrostructureConfig {
  readonly vpinBucketVolume?: number;
  readonly vpinNumBuckets?: number;
  readonly toxicityThreshold?: number; // e.g. 0.65
  readonly ofiWindowSize?: number;
}
