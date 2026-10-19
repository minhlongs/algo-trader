export interface MadhavanSmidtObservation {
  tradePrice: number;
  tradeVolume: number;
  tradeDirection: number; // +1 for buyer-initiated, -1 for seller-initiated
  inventory: number; // Specialist inventory position I_t
  priorQuoteMidpoint: number; // P^*_{t-1} or midpoint
  nextQuoteMidpoint: number; // P^*_t
}

export interface MadhavanSmidtParams {
  observations: MadhavanSmidtObservation[];
  targetInventory?: number; // I_0 (specialist preferred inventory)
}

export interface MadhavanSmidtResult {
  adverseSelectionWeight: number; // theta: Bayesian price revision weight
  inventoryHoldingCost: number; // gamma: inventory penalty parameter
  orderProcessingCost: number; // phi: fixed transaction cost parameter
  expectedInventoryMean: number;
  sampleSize: number;
}
