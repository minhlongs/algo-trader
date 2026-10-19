export interface StollTradeObservation {
  timestamp: number;
  tradePrice: number;
  bidPrice: number;
  askPrice: number;
  tradeDirection?: number; // +1 buyer-initiated, -1 seller-initiated
}

export interface Stoll89Params {
  observations: StollTradeObservation[];
  reversalProbability?: number; // Optional user override for pi in (0, 1)
}

export interface Stoll89Decomposition {
  quotedSpread: number;
  effectiveSpread: number;
  adverseSelectionShare: number; // alpha: fraction due to information
  inventoryHoldingShare: number; // beta: fraction due to inventory risk
  orderProcessingShare: number; // gamma = 1 - alpha - beta: fraction due to operational costs
  priceAutocovariance: number;
  midpointAutocovariance: number;
  reversalProbability: number; // pi
  sampleSize: number;
}
