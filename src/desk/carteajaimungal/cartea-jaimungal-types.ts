export interface CarteaJaimungalParams {
  midPrice: number;                    // Current mid-market price s
  currentInventory: number;            // Current inventory q
  targetInventory?: number;           // Target inventory (default 0)
  timeHorizon: number;                 // Total horizon T
  currentTime: number;                 // Current time t
  volatility: number;                  // Asset volatility sigma
  runningInventoryPenalty: number;     // Running inventory penalty phi >= 0
  terminalLiquidationPenalty: number;  // Terminal liquidation penalty alpha_term >= 0
  orderArrivalIntensity: number;       // Base order arrival rate A > 0
  orderArrivalSensitivity: number;     // Liquidity decay sensitivity k > 0
  alphaDrift?: number;                 // Alpha signal / short-term price drift alpha
}

export interface CarteaJaimungalQuotes {
  reservationPrice: number;
  optimalBid: number;
  optimalAsk: number;
  bidSpread: number;
  askSpread: number;
  totalSpread: number;
  inventorySkew: number;
  alphaTilt: number;
}
