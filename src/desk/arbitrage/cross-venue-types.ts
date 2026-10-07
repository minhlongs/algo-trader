/**
 * Cross-Venue Arbitrage Engine Type Definitions
 *
 * @module desk/arbitrage/cross-venue-types
 */

export type VenueName = 'POLYMARKET' | 'KALSHI' | 'LIMITLESS';

export interface VenueQuote {
  venue: VenueName;
  marketId: string;
  bestBid: number;
  bestAsk: number;
  bidDepth: number;
  askDepth: number;
  feeRate: number; // e.g. 0.001 for 0.1%
}

export interface MatchedMarketPair {
  pairId: string;
  eventDescription: string;
  venueAQuote: VenueQuote;
  venueBQuote: VenueQuote;
}

export interface CrossVenueArbOpportunity {
  pairId: string;
  buyVenue: VenueName;
  sellVenue: VenueName;
  buyPrice: number;
  sellPrice: number;
  grossSpread: number;
  netSpread: number;
  maxExecutableVolume: number;
  estimatedNetProfit: number;
  detectedAt: number;
}
