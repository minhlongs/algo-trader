/**
 * Wave 260: Cartea, Jaimungal & Ricci (2014) Alpha-Informed Market Making Types.
 * Strictly < 40 LOC, zero :any.
 */

export interface CarteaJaimungal2014AlphaConfig {
  readonly midPrice: number;
  readonly inventoryQ: number;
  readonly alphaDrift: number;
  readonly riskAversionGamma: number;
  readonly volatilitySigma: number;
  readonly fillIntensityA: number;
  readonly fillDecayK: number; // kappa / decay parameter
  readonly timeRemainingTau?: number;
  readonly baseSpreadDelta0?: number;
}

export interface CarteaJaimungal2014AlphaQuotes {
  readonly reservationPrice: number;
  readonly optimalBidSpread: number;
  readonly optimalAskSpread: number;
  readonly optimalBidPrice: number;
  readonly optimalAskPrice: number;
  readonly fillIntensityBid: number;
  readonly fillIntensityAsk: number;
  readonly totalSpread: number;
  readonly alphaSkewAdjustment: number;
}
