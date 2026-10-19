export interface HuangStollObservation {
  tradePrice: number; // P_t
  quoteMidpoint: number; // M_t = (Ask_t + Bid_t) / 2
  tradeDirection: number; // Q_t in {-1, +1} (Lee-Ready trade initiator sign)
  quotedSpread: number; // S_t = Ask_t - Bid_t
}

export interface HuangStollDecompositionResult {
  adverseSelectionShare: number; // alpha: private information portion
  orderProcessingShare: number; // gamma: order processing cost portion
  inventoryHoldingShare: number; // 1 - alpha - gamma: inventory cost portion
  effectiveSpread: number; // Average effective half-spread
  tradePersistence: number; // pi = Prob(Q_t = Q_{t-1})
  sampleSize: number;
}
