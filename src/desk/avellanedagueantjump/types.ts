/**
 * Wave 255: Avellaneda-Stoikov / Guéant Jump-Diffusion Market Making Types
 * Strictly < 40 LOC, zero :any.
 */

export interface AvellanedaGueantJumpConfig {
  readonly riskGamma: number;
  readonly volatilitySigma: number;
  readonly jumpIntensityLambda: number;
  readonly jumpMeanMu: number;
  readonly jumpSigma: number;
  readonly terminalTimeT: number;
  readonly kappaOrderBook: number;
  readonly midPriceS?: number;
  readonly inventoryQ?: number;
  readonly tickSize?: number;
}

export interface MarketMakerQuoteState {
  readonly reservationPrice: number;
  readonly deltaA: number;
  readonly deltaB: number;
  readonly bidPrice: number;
  readonly askPrice: number;
  readonly totalSpread: number;
  readonly jumpVarianceHazard: number;
  readonly jumpDriftHazard: number;
}
