export type BinaryOutcome = 'YES' | 'NO';
export type OrderSide = 'BUY' | 'SELL';

export interface BinaryOptionPricingInput {
  spotPrice: number;
  strikePrice: number;
  timeToExpiryYears: number;
  volatility: number;
  riskFreeRate?: number;
}

export interface BinaryPricingResult {
  binaryCallProbability: number;
  binaryPutProbability: number;
  d1: number;
  d2: number;
}

export interface CexTick {
  timestampMs: number;
  price: number;
  volume?: number;
}

export interface ToxicFlowAnalysis {
  velocity: number;
  acceleration: number;
  isToxic: boolean;
  skewDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  flowSeverity: number;
}

export interface InventorySkewConfig {
  inventory: number;
  maxInventory: number;
  gammaRiskAversion: number;
  volatility: number;
  timeHorizonFraction: number;
  liquidityParamKappa: number;
}

export interface MarketMakingQuote {
  reservationPrice: number;
  optimalSpread: number;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  toxicCancel: boolean;
  cancelReason?: string;
}

export interface PolymarketStatArbConfig {
  marketId: string;
  strikePrice: number;
  expiryTimestampMs: number;
  riskAversionGamma: number;
  baseSpread: number;
  maxInventory: number;
  toxicVelocityThreshold: number;
  orderLotSize: number;
  volatilityDefault?: number;
  riskFreeRate?: number;
}
