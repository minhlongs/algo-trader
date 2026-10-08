export interface AvellanedaStoikovParams {
  midPrice: number;            // s: Current reference asset mid-price
  currentInventory: number;    // q: Current held inventory (positive = long, negative = short)
  targetInventory: number;     // q_target: Desired terminal inventory (usually 0)
  timeHorizon: number;         // T: Total trading session length (e.g. 1.0 day or 0.1)
  currentTime: number;         // t: Current elapsed time
  volatility: number;          // sigma: Price volatility
  riskAversion: number;        // gamma: Inventory risk aversion coefficient (gamma > 0)
  orderArrivalIntensity: number;// k: Order book liquidity decay parameter (kappa)
  orderArrivalScale: number;   // A: Order book intensity constant
}

export interface AvellanedaStoikovQuotes {
  reservationPrice: number;    // r(s, q, t): Indifference price for the market maker
  optimalBid: number;          // r_b: Quoted bid price
  optimalAsk: number;          // r_a: Quoted ask price
  bidSpread: number;           // delta_b = s - r_b
  askSpread: number;           // delta_a = r_a - s
  totalSpread: number;         // delta_a + delta_b
  inventoryPenalty: number;    // Difference between midPrice and reservationPrice
}
