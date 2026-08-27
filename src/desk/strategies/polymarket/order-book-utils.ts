/**
 * Negative Risk Scanner — order-book helpers.
 *
 * Pure functions for reading best ask/bid and computing token amounts and
 * exit value. Re-exported from negative-risk-scanner.ts for facade parity.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';

/** Extract best ask price from order book (lowest ask). Returns 1 if no asks. */
export function getBestAsk(book: RawOrderBook): number {
  if (book.asks.length === 0) return 1;
  return parseFloat(book.asks[0].price);
}

/** Extract best bid price from order book (highest bid). Returns 0 if no bids. */
export function getBestBid(book: RawOrderBook): number {
  if (book.bids.length === 0) return 0;
  return parseFloat(book.bids[0].price);
}

/** Calculate token amount from USD size and price. Rounds to nearest integer. */
export function usdcToTokens(usdc: number, price: number): number {
  if (price <= 0) return 0;
  return Math.round(usdc / price);
}

/** Calculate total exit value (USD) for an arb position at current prices. */
export function calcExitValue(
  yesBid: number,
  noBid: number,
  yesSizeUsdc: number,
  noSizeUsdc: number,
  yesEntryPrice: number,
  noEntryPrice: number
): { exitValue: number; entryCost: number; pnlPct: number } {
  const yesTokens = usdcToTokens(yesSizeUsdc, yesEntryPrice);
  const noTokens = usdcToTokens(noSizeUsdc, noEntryPrice);
  const exitValue = yesTokens * yesBid + noTokens * noBid;
  const entryCost = yesSizeUsdc + noSizeUsdc;
  const pnlPct = entryCost > 0 ? (exitValue - entryCost) / entryCost : 0;
  return { exitValue, entryCost, pnlPct };
}