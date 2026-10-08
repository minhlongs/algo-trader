export interface GueantParams {
  midPrice: number;                 // Spot mid-price S
  maxInventory: number;             // Maximum absolute inventory Q (q in [-Q, Q])
  currentInventory?: number;        // Specific inventory q to highlight (default 0)
  timeHorizon: number;              // Total horizon T (years or fraction)
  currentTime: number;              // Current time t (t < T)
  volatility: number;               // Mid-price volatility sigma
  riskAversion: number;             // Risk aversion parameter gamma > 0
  orderIntensityA: number;          // Poisson order arrival base intensity A > 0
  orderSensitivityK: number;         // Order arrival price sensitivity k > 0
  terminalLiquidationPenalty: number;// Terminal liquidation cost alpha_term >= 0
}

export interface GueantQuote {
  inventory: number;
  optimalBidSpread: number;         // delta^b*(q)
  optimalAskSpread: number;         // delta^a*(q)
  totalSpread: number;              // delta^a*(q) + delta^b*(q)
  optimalBid: number;               // S - delta^b*(q)
  optimalAsk: number;               // S + delta^a*(q)
  reservationPrice: number;         // Implied indifference price
}

export interface GueantResult {
  quotes: GueantQuote[];
  currentQuote: GueantQuote;
  matrixDimension: number;          // 2Q + 1
  constantC: number;                // Transition coupling constant C
}
