/**
 * Cross-Market Arbitrage Types and Helpers
 *
 * @module desk/strategies/polymarket/cross-market-arb-types
 */

export interface CrossMarketArbConfig {
  /** Minimum basis (absolute price difference) to enter */
  minBasis: number;
  /** Basis level at which to exit (must be <= minBasis) */
  exitBasis: number;
  /** Default position size in USDC per leg */
  defaultSizeUsdc: number;
  /** Max concurrent arb positions */
  maxPositions: number;
}

export const DEFAULT_CONFIG: CrossMarketArbConfig = {
  minBasis: 0.05,
  exitBasis: 0.02,
  defaultSizeUsdc: 50,
  maxPositions: 3,
};

export interface ArbPosition {
  tokenIdA: string;
  tokenIdB: string;
  conditionIdA: string;
  conditionIdB: string;
  entryBasis: number;
  sideA: 'yes' | 'no';
  sizeUsdc: number;
  openedAt: number;
}

/** Compute absolute basis between two mid-prices. */
export function computeBasis(priceA: number, priceB: number): number {
  return Math.abs(priceA - priceB);
}

/** Determine direction: buy the cheaper side (relative to the other). */
export function getArbDirection(
  priceA: number,
  priceB: number,
): { sideA: 'yes' | 'no'; sideB: 'yes' | 'no' } {
  if (priceA < priceB) return { sideA: 'yes', sideB: 'no' };
  return { sideA: 'no', sideB: 'yes' };
}

export function calcBookMidPrice(book: {
  bids: Array<{ price: string }>;
  asks: Array<{ price: string }>;
}): number {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0]!.price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0]!.price) : 1;
  return (bid + ask) / 2;
}
