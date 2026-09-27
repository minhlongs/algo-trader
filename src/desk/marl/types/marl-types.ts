/**
 * Core MARL Market-Making domain types.
 * Defines canonical order book levels, quoting actions, agent proposals, and observations.
 */

export interface MarlOrderBookLevel {
  price: number;
  size: number;
  orderCount?: number;
}

export interface MarlOrderBook {
  symbol: string;
  venue: string;
  bids: MarlOrderBookLevel[];
  asks: MarlOrderBookLevel[];
  timestamp: number;
  sequence?: number;
}

export type QuotingMode = 'BOTH' | 'BID_ONLY' | 'ASK_ONLY' | 'CANCEL_ALL';

export interface QuoteProposal {
  agentId: string;
  symbol: string;
  venue: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  reservationPrice: number;
  bidSpread: number;
  askSpread: number;
  confidence: number;
  skewFactor?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface QuotingAction {
  agentId: string;
  mode: QuotingMode;
  bidSpreadMultiplier: number;
  askSpreadMultiplier: number;
  bidSizeRatio: number;
  askSizeRatio: number;
  targetBidPrice?: number;
  targetAskPrice?: number;
  targetBidSize?: number;
  targetAskSize?: number;
}

export interface AgentObservation {
  symbol: string;
  venue: string;
  midPrice: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  orderBookImbalance: number;
  depthImbalance: number;
  inventory: number;
  timeToHorizonSec: number;
  volatility: number;
  netDelta: number;
  observationVector?: Float64Array | number[];
  timestamp: number;
}

export interface MarlAgentConfig {
  agentId: string;
  agentType: 'adaptive' | 'inventory_skew' | 'baseline_as' | 'custom';
  gamma: number;
  kappa: number;
  maxInventory: number;
  quoteSize: number;
  minSpread: number;
  maxSpread: number;
  tickSize: number;
  enabled: boolean;
  weight: number;
}

export interface AvellanedaStoikovParams {
  gamma: number;           // Risk aversion parameter (e.g. 0.1)
  kappa: number;           // Orderbook liquidity intensity parameter (e.g. 1.5)
  sigma: number;           // Realized volatility of asset
  terminalHorizonSec: number; // Session duration in seconds
  tickSize: number;        // Minimum tick increment (e.g. 0.01)
  minSpread: number;       // Minimum allowable spread
  maxSpread: number;       // Maximum allowable spread
}

export interface QuoteCalculationResult {
  reservationPrice: number;
  bidPrice: number;
  askPrice: number;
  bidSpread: number;
  askSpread: number;
  totalSpread: number;
}

