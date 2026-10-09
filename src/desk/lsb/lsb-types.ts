export interface LsbTradeObservation {
  tradePrice: number;
  bid: number;
  ask: number;
}

export interface LsbParams {
  observations: LsbTradeObservation[];
}

export interface LsbDecompositionResult {
  quotedSpread: number; // S = Ask - Bid
  effectiveSpread: number; // 2 * |P_t - Q_t|
  adverseSelectionFraction: number; // lambda (information share)
  orderProcessingFraction: number; // (1 - lambda) * (1 - delta)
  inventoryHoldingFraction: number; // (1 - lambda) * delta
  orderPersistence: number; // delta
  sampleSize: number;
}
