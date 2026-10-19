export interface GknObservation {
  tradePrice: number;
  bid: number;
  ask: number;
}

export interface GknParams {
  observations: GknObservation[];
}

export interface GknDecompositionResult {
  quotedSpread: number; // Average quoted spread S
  effectiveSpread: number; // Effective spread proxy
  adverseSelectionFraction: number; // pi: fraction of spread due to informed trading
  orderProcessingFraction: number; // (1 - pi): fraction of spread due to order processing
  expectedReturnVariance: number; // Unanticipated information flow variance
  sampleSize: number;
}
