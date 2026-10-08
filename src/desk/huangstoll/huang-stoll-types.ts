export interface HuangStollTick {
  readonly price: number;
  readonly bid: number;
  readonly ask: number;
  readonly signedTrade: number; // +1 buyer initiated, -1 seller initiated
}

export interface HuangStollDecompositionResult {
  readonly adverseSelectionAlpha: number;  // Fraction alpha (information asymmetry)
  readonly inventoryHoldingBeta: number;   // Fraction beta (inventory cost)
  readonly orderProcessingGamma: number;   // Fraction gamma (order processing cost)
  readonly averageHalfSpread: number;      // S_bar
  readonly tradePersistencePi: number;     // P(Q_t == Q_{t-1})
  readonly adverseSelectionCost: number;   // alpha * S_bar
  readonly inventoryHoldingCost: number;    // beta * S_bar
  readonly orderProcessingCost: number;    // gamma * S_bar
  readonly sampleSize: number;
}
