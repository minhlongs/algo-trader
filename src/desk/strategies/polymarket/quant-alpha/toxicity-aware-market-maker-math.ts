/**
 * Pure helper functions for the toxicity-aware market maker.
 *
 * No imports and no I/O: every function here is a decision the scan path makes
 * about numbers it already holds, so a test can pin the arithmetic without a
 * venue, a clock or a random source.
 */

/** Money precision guard — prices and costs are compared, never exact-equalled. */
export const PAIR_EPSILON = 1e-9;

/** Round to the market tick, staying inside the open interval (0, 1). */
export function roundToTick(price: number, tickSize: number): number {
  if (!(tickSize > 0) || !Number.isFinite(price)) return 0;
  const ticks = Math.round(price / tickSize);
  const snapped = ticks * tickSize;
  const decimals = Math.max(0, String(tickSize).split('.')[1]?.length ?? 0);
  return Number(snapped.toFixed(decimals));
}

/**
 * The quote price on the side being bought, given the visible touch.
 *
 * A maker must join a level the book actually shows: the queue simulator
 * matches prices exactly, so an off-level quote is indistinguishable from
 * quoting into a level nobody is at. `one-tick-inside` therefore only moves
 * inward by a whole tick and still snaps to the tick grid.
 */
export function quotePrice(
  side: 'buy' | 'sell',
  touchPrice: number,
  placement: 'touch' | 'one-tick-inside',
  tickSize: number,
): number {
  if (!(touchPrice > 0) || touchPrice >= 1) return 0;
  if (placement === 'touch') return roundToTick(touchPrice, tickSize);
  const moved = side === 'buy' ? touchPrice + tickSize : touchPrice - tickSize;
  const snapped = roundToTick(moved, tickSize);
  return snapped > 0 && snapped < 1 ? snapped : 0;
}

/**
 * Cost of buying one YES and one NO share for cash collateral.
 *
 * The pair redeems for exactly 1.00 pUSD at resolution, so anything at or above
 * 1.00 is a certain loss that only looks like a spread capture.
 */
export function pairCostPusd(yesPrice: number, noPrice: number): number {
  if (!(yesPrice > 0) || !(noPrice > 0)) return Number.POSITIVE_INFINITY;
  return yesPrice + noPrice;
}

/** True when the pair can be bought for strictly less than the cap. */
export function isPairArbitrage(quote: PairQuoteLike, maxPairCostPusd: number): boolean {
  const cost = pairCostPusd(quote.yesBidPrice, quote.noBidPrice);
  if (!Number.isFinite(cost)) return false;
  return cost < maxPairCostPusd - PAIR_EPSILON;
}

export interface PairQuoteLike {
  yesBidPrice: number;
  noBidPrice: number;
}

/**
 * Markout in bps of one long token fill, measured in the held token's own mid
 * price (`yesTokenId` mid for YES leg, `noTokenId` mid for NO leg). Both legs of
 * a cash-collateralised pair are long `BUY` positions in distinct ERC-1155 tokens,
 * so a drop in that token's own mid (`laterTokenPrice < entryPrice`) is adverse.
 */
export function markoutBps(entryPrice: number, laterTokenPrice: number, _side?: 'yes' | 'no'): number {
  if (!(entryPrice > 0)) return 0;
  return ((laterTokenPrice - entryPrice) / entryPrice) * 10_000;
}

/**
 * One-directional fill pressure: how many of our fills in the last minute were
 * on the same outcome AND showed negative markout. The report kills at 3.
 */
export function countAdverseOneSidedFills(
  fills: ReadonlyArray<{ side: 'yes' | 'no'; markoutBps: number; atMs: number }>,
  nowMs: number,
  windowMs: number,
  maxPerSide: number,
): boolean {
  const windowStart = nowMs - windowMs;
  let yes = 0;
  let no = 0;
  for (const fill of fills) {
    if (fill.atMs < windowStart) continue;
    if (!(fill.markoutBps < 0)) continue;
    if (fill.side === 'yes') yes += 1;
    else no += 1;
  }
  return yes > maxPerSide || no > maxPerSide;
}

/**
 * Liquidity-aware quote size. The report's SKU cap: once the displayed size at
 * our level is below the cap the quote is clipped to the displayed depth, so we
 * never appear to be quoting more than the book can absorb.
 */
export function capQuoteSize(requestedShares: number, displayedShares: number, skuCapShares: number): number {
  if (!(requestedShares > 0)) return 0;
  if (!(displayedShares > 0)) return 0;
  const cap = Math.min(skuCapShares, displayedShares);
  return Math.max(0, Math.min(requestedShares, cap));
}

/**
 * Ranking score for market selection: (Reward + Rebate) per unit of realized
 * volatility. A market that pays the same liquidity reward but moves twice as
 * much is half as attractive.
 */
export function rewardPerVolatility(rewardPusd: number, rebatePusd: number, realizedVol: number): number {
  const reward = (rewardPusd > 0 ? rewardPusd : 0) + (rebatePusd > 0 ? rebatePusd : 0);
  if (!(reward > 0)) return 0;
  if (!(realizedVol > 0)) return reward;
  return reward / realizedVol;
}

/**
 * Keep the top `fraction` of markets by rank score. `fraction` of 1 returns all.
 * Deterministic: ties break on the original order, so a rerun ranks identically.
 */
export function topFractionByScore<T>(
  items: ReadonlyArray<{ item: T; score: number }>,
  fraction: number,
): T[] {
  if (items.length === 0) return [];
  const keep = Math.max(1, Math.ceil(items.length * clampFraction(fraction)));
  const ranked = items
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return ranked.slice(0, keep).map((entry) => entry.item);
}

function clampFraction(fraction: number): number {
  if (!(fraction > 0)) return 0;
  return fraction > 1 ? 1 : fraction;
}

/** True when remaining life is shorter than the report's 30-minute no-quote window. */
export function isCloseToExpiry(endDateIso: string, nowMs: number, minTimeToExpiryMs: number): boolean {
  const endMs = Date.parse(endDateIso);
  if (!Number.isFinite(endMs)) return true;
  return endMs - nowMs < minTimeToExpiryMs;
}

/** Highest bid price across a level set. 0 when the side is empty. */
export function bestBidPrice(levels: ReadonlyArray<{ price: string }>): number {
  let best = 0;
  for (const level of levels) {
    const price = parseFloat(level.price);
    if (price > best) best = price;
  }
  return best;
}

/** Displayed size exactly at `price`. A maker must join a level the book shows. */
export function sizeAtLevel(levels: ReadonlyArray<{ price: string; size: string }>, price: number): number {
  const level = levels.find((entry) => Math.abs(parseFloat(entry.price) - price) <= PAIR_EPSILON);
  return level ? parseFloat(level.size) || 0 : 0;
}

/**
 * Only the closest `depth` levels participate in toxicity measurement.
 *
 * Closest means highest price on the bid side and lowest price on the ask side,
 * so the same helper serves both books without silently measuring the far tail
 * of the ask ladder.
 */
export function topLevels<T extends { price: string }>(
  levels: ReadonlyArray<T>,
  depth: number,
  side: 'bid' | 'ask',
): T[] {
  if (!(depth > 0) || levels.length <= depth) return [...levels];
  const sorted = [...levels].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  return side === 'bid' ? sorted.slice(-depth).reverse() : sorted.slice(0, depth);
}

/** Append one sample and keep only the last `max`, so history memory is bounded. */
export function appendCapped(history: ReadonlyArray<number>, value: number, max: number): number[] {
  const next = [...history, value];
  return next.length > max ? next.slice(next.length - max) : next;
}
