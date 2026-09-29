/**
 * Core AMM Domain Types & Interfaces
 * Prediction Market AMM Liquidity Engine
 */

export type AmmPricingModel = 'LMSR' | 'CPMM';

export interface OutcomeToken {
  index: number;
  symbol: string;
  name: string;
  tokenId: string;
}

export interface OutcomeTokenState extends OutcomeToken {
  virtualReserve: number; // R_i for CPMM or q_i liability for LMSR
  clobBestBid: number;
  clobBestAsk: number;
  clobBidDepth: number;
  clobAskDepth: number;
  impliedProbability: number;
}

export interface MultiOutcomeMarket {
  marketId: string;
  conditionId: string;
  question: string;
  outcomes: OutcomeToken[];
  collateralToken: string; // e.g. 'USDC'
  resolutionTimeMs: number;
  resolved: boolean;
  winningOutcomeIndex?: number;
}

export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface OrderbookSnapshot {
  marketId: string;
  outcomeIndex: number;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  timestampMs: number;
}

export interface InboundOrder {
  orderId: string;
  marketId: string;
  outcomeIndex: number;
  side: 'BUY' | 'SELL';
  size: number;
  maxSlippageBps?: number;
  limitPrice?: number;
}

export interface RouteLeg {
  venue: 'CLOB' | 'AMM';
  outcomeIndex: number;
  price: number;
  size: number;
  costUsdc: number;
}

export interface HybridRouteResult {
  orderId: string;
  outcomeIndex: number;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  filledSize: number;
  totalCostUsdc: number;
  vwap: number;
  legs: RouteLeg[];
  fullyFilled: boolean;
}

export interface PoolTradeRequest {
  poolId: string;
  outcomeIndex: number;
  action: 'BUY' | 'SELL' | 'SWAP';
  amount: number; // shares if SELL, usdc if BUY (or input amount for SWAP)
  targetOutcomeIndex?: number; // for direct SWAP
  maxSlippageBps?: number;
}

export interface PoolTradeResult {
  poolId: string;
  outcomeIndex: number;
  action: 'BUY' | 'SELL' | 'SWAP';
  inputAmount: number;
  outputAmount: number;
  feePaidUsdc: number;
  effectivePrice: number;
  spotPriceBefore: number;
  spotPriceAfter: number;
  timestampMs: number;
}

export interface CompleteSetResult {
  operation: 'MINT' | 'MERGE';
  setCount: number;
  collateralUsdc: number;
  feeUsdc: number;
  timestampMs: number;
}

export interface InventoryState {
  marketId: string;
  outcomeShares: number[];
  unallocatedUsdc: number;
  totalCommittedCapitalUsdc: number;
  timestampMs: number;
}
