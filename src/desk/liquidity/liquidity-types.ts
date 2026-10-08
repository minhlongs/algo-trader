/**
 * Dark Pool & ATS Liquidity Aggregator Types
 * Venue depth, smart sweep allocations, toxicity metrics, and fill simulator types.
 *
 * @module desk/liquidity/liquidity-types
 */

export interface VenueQuote {
  venueId: string;
  venueType: 'LIT_EXCHANGE' | 'DARK_POOL_ATS' | 'INTERNAL_CROSS';
  availableSize: number;
  price: number;
  feeOrRebateUsdPerShare: number; // Positive = fee, Negative = rebate
  historicalFillProbability: number; // 0.0 to 1.0
  historicalAdverseDriftBps: number; // Toxicity metric
}

export interface SweepOrderRequest {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  totalQuantity: number;
  limitPrice: number;
  urgency: 'PASSIVE' | 'NEUTRAL' | 'AGGRESSIVE';
}

export interface VenueAllocation {
  venueId: string;
  venueType: VenueQuote['venueType'];
  allocatedQuantity: number;
  expectedFillQuantity: number;
  expectedEffectivePrice: number;
  expectedFeeUsd: number;
}

export interface SweepResult {
  orderId: string;
  totalRequested: number;
  totalAllocated: number;
  expectedFillRatePct: number;
  weightedAveragePrice: number;
  allocations: VenueAllocation[];
  estimatedTotalImpactBps: number;
}

export interface SimulatedFillEvent {
  venueId: string;
  requestedQty: number;
  executedQty: number;
  executionPrice: number;
  wasAdverselySelected: boolean;
  postTradeAlphaDriftBps: number;
}
