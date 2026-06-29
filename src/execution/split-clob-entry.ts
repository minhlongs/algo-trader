/**
 * Split + CLOB Entry Mechanism (Paper Trading)
 * Cheaper entry via CTF split: deposit USDC → mint YES+NO → sell unwanted side on CLOB.
 *
 * Economics:
 *   Direct buy YES:  cost = yesPrice per share
 *   Split entry:     deposit $1 → mint 1 YES + 1 NO → sell NO at bestNoBid
 *                    net cost = 1.0 - bestNoBid per YES share
 *   Savings exist when: yesPrice + bestNoBid > 1.0 (spread exceeds $1)
 *
 * NOTE: Pure paper-trading calculation — no real on-chain transactions.
 */

import { logger } from '../shared/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface MarketPrices {
  marketId: string;
  yesPrice: number;
  noPrice: number;
  yesBids: OrderBookLevel[];  // sorted descending
  noBids: OrderBookLevel[];   // sorted descending
}

export interface SplitEntry {
  marketId: string;
  targetSide: 'YES' | 'NO';
  depositAmount: number;       // USDC deposited into CTF
  mintedShares: number;        // shares minted (= depositAmount for binary CTF)
  sellSide: 'YES' | 'NO';     // opposite of targetSide — sold on CLOB
  sellPrice: number;           // best bid for sell side
  sellProceeds: number;        // sellPrice * mintedShares
  netCost: number;             // depositAmount - sellProceeds
  netCostPerShare: number;     // netCost / mintedShares
  directCostPerShare: number;  // what direct CLOB buy would cost
  savings: number;             // directCostPerShare - netCostPerShare
  savingsPercent: number;      // savings / directCostPerShare * 100
  isCheaper: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Best bid = highest price a buyer will pay. Returns 0 if no bids. */
function getBestBid(bids: OrderBookLevel[]): number {
  return bids.length > 0 ? bids[0].price : 0;
}

/** Total liquidity at or above minPrice in an order book side. */
function getAvailableLiquidity(bids: OrderBookLevel[], minPrice: number): number {
  return bids.filter(b => b.price >= minPrice).reduce((sum, b) => sum + b.size, 0);
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate split+CLOB entry economics.
 * Binary CTF: $1 USDC mints exactly 1 YES + 1 NO share.
 */
export function calculateSplitEntry(
  marketId: string,
  targetSide: 'YES' | 'NO',
  depositAmount: number,
  market: MarketPrices,
): SplitEntry {
  if (depositAmount <= 0) throw new Error('depositAmount must be > 0');

  const mintedShares = depositAmount; // 1:1 binary CTF
  const sellSide: 'YES' | 'NO' = targetSide === 'YES' ? 'NO' : 'YES';
  const sellBids = sellSide === 'NO' ? market.noBids : market.yesBids;
  const directCostPerShare = targetSide === 'YES' ? market.yesPrice : market.noPrice;

  const sellPrice = getBestBid(sellBids);
  const sellProceeds = sellPrice * mintedShares;
  const netCost = depositAmount - sellProceeds;
  const netCostPerShare = mintedShares > 0 ? netCost / mintedShares : netCost;
  const savings = directCostPerShare - netCostPerShare;
  const savingsPercent = directCostPerShare > 0 ? (savings / directCostPerShare) * 100 : 0;

  const result: SplitEntry = {
    marketId,
    targetSide,
    depositAmount,
    mintedShares,
    sellSide,
    sellPrice,
    sellProceeds,
    netCost,
    netCostPerShare,
    directCostPerShare,
    savings,
    savingsPercent,
    isCheaper: savings > 0,
  };

  logger.debug('[SplitEntry] Calculated', {
    marketId, targetSide,
    direct: directCostPerShare.toFixed(4),
    net: netCostPerShare.toFixed(4),
    savings: savings.toFixed(4),
    savingsPct: savingsPercent.toFixed(2) + '%',
  });

  return result;
}

/**
 * Quick check: is split+sell cheaper than direct CLOB buy?
 *
 * For YES: savings = yesPrice - (1 - bestNoBid) = yesPrice + bestNoBid - 1
 * Savings > 0  ⟺  targetPrice + bestOppBid > 1.0
 */
export function isSplitCheaper(targetSide: 'YES' | 'NO', market: MarketPrices): boolean {
  const sellBids = targetSide === 'YES' ? market.noBids : market.yesBids;
  const bestOppBid = getBestBid(sellBids);
  const targetPrice = targetSide === 'YES' ? market.yesPrice : market.noPrice;
  const isCheaper = (targetPrice + bestOppBid) > 1.0;

  logger.debug('[SplitEntry] isSplitCheaper', {
    marketId: market.marketId, targetSide,
    targetPrice, bestOppBid,
    sum: (targetPrice + bestOppBid).toFixed(4),
    isCheaper,
  });

  return isCheaper;
}

/**
 * Find the side (YES or NO) with maximum savings from a split entry.
 * Returns null if neither side is cheaper than direct buy.
 */
export function findBestSplitSide(market: MarketPrices, depositAmount: number): SplitEntry | null {
  const yesSplit = calculateSplitEntry(market.marketId, 'YES', depositAmount, market);
  const noSplit = calculateSplitEntry(market.marketId, 'NO', depositAmount, market);
  const candidates = [yesSplit, noSplit].filter(s => s.isCheaper);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.savings > best.savings ? c : best));
}

/**
 * Returns true if CLOB bids can absorb the full sell side of a split entry.
 * @param minBidPrice - minimum acceptable bid price (default 1 cent)
 */
export function hasSufficientLiquidity(
  targetSide: 'YES' | 'NO',
  market: MarketPrices,
  depositAmount: number,
  minBidPrice = 0.01,
): boolean {
  const sellBids = targetSide === 'YES' ? market.noBids : market.yesBids;
  return getAvailableLiquidity(sellBids, minBidPrice) >= depositAmount;
}

/**
 * Minimum deposit where savings exceed a given percentage threshold.
 * Useful for sizing trades: splits only make sense above a certain size.
 * Returns null if split is never cheaper for this market + side.
 */
export function minimumDepositForSplit(
  targetSide: 'YES' | 'NO',
  market: MarketPrices,
  minSavingsPercent = 0.5,
): number | null {
  const probe = calculateSplitEntry(market.marketId, targetSide, 1000, market);
  if (!probe.isCheaper || probe.savingsPercent < minSavingsPercent) return null;
  return Math.max(100, 1000 * (minSavingsPercent / probe.savingsPercent));
}
