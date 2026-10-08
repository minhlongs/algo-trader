/**
 * High-Frequency Market Making & Hawkes Toxicity Types
 * Jump processes, Guéant-Tapia-Manzi inventory skew quotes, and adverse selection markouts.
 *
 * @module desk/marketmaking/marketmaking-types
 */

export interface TradeTick {
  tradeId: string;
  symbol: string;
  timestampMs: number;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
}

export interface HawkesParameters {
  baselineMu: number; // unconditional background arrival rate
  alphaSelf: number; // self-excitation jump size
  alphaCross: number; // cross-excitation jump size from opposite side
  betaDecay: number; // exponential kernel decay rate
}

export interface HawkesIntensitySnapshot {
  timestampMs: number;
  buyIntensity: number;
  sellIntensity: number;
  crossExcitationRatio: number;
  toxicityLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface GueantInventoryParameters {
  riskAversionGamma: number; // inventory aversion parameter gamma
  orderArrivalA: number; // intensity scaling constant A
  orderIntensityK: number; // liquidity parameter k in lambda(delta) = A * e^(-k * delta)
  assetVolatilitySigma: number; // asset annualized/intraday return volatility
  terminalHorizonSec: number; // remaining execution/quoting horizon T
}

export interface QuotingDecision {
  midpoint: number;
  currentInventory: number;
  reservationPrice: number;
  optimalBid: number;
  optimalAsk: number;
  bidSpread: number;
  askSpread: number;
}

export interface AdverseSelectionMarkout {
  tradeId: string;
  side: 'BUY' | 'SELL';
  executionPrice: number;
  markout10msPrice: number;
  markout100msPrice: number;
  markout1sPrice: number;
  shortHorizonLossBps: number;
  isToxicFlow: boolean;
}
