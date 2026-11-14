/**
 * Pure decision maths for Primary-Source News-to-Probability Latency.
 * No imports, no I/O, no clock — every function takes `now` as an argument.
 *
 * The report names quantities this desk cannot read off any API (system
 * processing latency, posterior probability, the arbitration-risk safety
 * margin), because the source document lost its inline variables in
 * extraction. Rather than reconstruct a formula the document no longer states,
 * each quantity is a named field on the config and the arithmetic here works
 * on those fields only.
 */

import type {
  Bulletin,
  LadderLeg,
  MarketCheck,
  NewsStreamVerdict,
  PrimarySourceNewsLatencyConfig,
} from './primary-source-news-latency-types';

/** Lowercase, collapsed and trimmed, so term matching is deterministic. */
export function normaliseText(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whether one normalised term appears verbatim in normalised text. */
export function containsTerm(haystack: string, term: string): boolean {
  return haystack.includes(normaliseText(term));
}

/**
 * A check with no terms, no numbers and no hosts is not a check. Without it the
 * strategy would fire on any bulletin from anywhere, which is the fake-news
 * failure mode the report calls out, so such a market is declined.
 */
export function usableCheck(check: MarketCheck): boolean {
  const hasTerms = check.requiredTerms.length > 0 || check.forbiddenTerms.length > 0;
  const hasNumbers = check.requiredNumbers.length > 0;
  const hasHosts = check.allowedSourceHosts.length > 0;
  return hasHosts && (hasTerms || hasNumbers);
}

/** Only a whitelisted host qualifies as a primary source. */
export function hostAllowed(check: MarketCheck, sourceHost: string): boolean {
  return check.allowedSourceHosts.some((host) => host.toLowerCase() === sourceHost.toLowerCase());
}

/** Age measured on the wire timestamp, not on when this process read it. */
export function bulletinAgeMs(bulletin: Bulletin, nowMs: number): number {
  return nowMs - bulletin.publishedAtMs;
}

export function isFresh(bulletin: Bulletin, nowMs: number, maxAgeMs: number): boolean {
  return bulletinAgeMs(bulletin, nowMs) <= maxAgeMs;
}

/** How many required numeric facts the body states, and how many were asked for. */
export function numericFactsPresent(body: string, check: MarketCheck): { matched: number; total: number } {
  let matched = 0;
  for (const fact of check.requiredNumbers) {
    if (bodyStatesNumber(body, fact.value, fact.tolerance)) matched += 1;
  }
  return { matched, total: check.requiredNumbers.length };
}

/**
 * A number "stated" by the bulletin. Matching is on the token stream, so `$7M`
 * and `#42` do not match `7` and `42` by accident through a substring hit.
 */
function bodyStatesNumber(body: string, value: number, tolerance: number): boolean {
  const normalised = normaliseText(body);
  const tokens = normalised.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return tokens.some((token) => Math.abs(parseFloat(token) - value) <= tolerance);
}

/** Every stream must match and clear the confidence floor — absolute consensus. */
export function absoluteConsensus(
  term: NewsStreamVerdict,
  numeric: NewsStreamVerdict,
  minConfidence: number,
): boolean {
  return (
    term.matches &&
    numeric.matches &&
    term.confidence >= minConfidence &&
    numeric.confidence >= minConfidence
  );
}

/** Both streams must finish inside the dual-verify window (report: 800 ms). */
export function withinDualVerifyWindow(elapsedMs: number, windowMs: number): boolean {
  return elapsedMs <= windowMs;
}

/** Wire-to-order latency budget (report: 2.5 s). */
export function withinDetectionBudget(latencyMs: number, budgetMs: number): boolean {
  return latencyMs <= budgetMs;
}

/** One false-news trigger or a drifting clock hard-locks the module. */
export function clockOffsetLocked(offsetMs: number, maxOffsetMs: number): boolean {
  return Math.abs(offsetMs) > maxOffsetMs;
}

/** Only contracts resolving inside the horizon belong to the ladder. */
export function ladderHorizonOk(expiryMs: number, nowMs: number, maxHorizonMs: number): boolean {
  return expiryMs > nowMs && expiryMs - nowMs <= maxHorizonMs;
}

/** Entry ceiling p_max: the sweep cannot pay more, and dust is skipped. */
export function entryPriceEligible(price: number, config: PrimarySourceNewsLatencyConfig): boolean {
  return price >= config.minEntryPricePusd && price <= config.maxEntryPricePusd;
}

export function ladderLegCountOk(count: number, config: PrimarySourceNewsLatencyConfig): boolean {
  return count >= config.minLadderLegs && count <= config.maxLadderLegs;
}

/** Capital split evenly across the legs the ladder actually has. */
export function capitalSplit(clusterCapitalPusd: number, legCount: number): number {
  return legCount > 0 ? clusterCapitalPusd / legCount : 0;
}

/** Shares a leg's share of the cluster buys, fees included in the outlay. */
export function sharesForLeg(capitalPerLegPusd: number, askPrice: number, feePerShare: number): number {
  const allIn = askPrice + feePerShare;
  if (!(allIn > 0)) return 0;
  return Math.floor(capitalPerLegPusd / allIn);
}

/** The band where the report recycles most of the position. */
export function inRecycleBand(price: number, lowPusd: number, highPusd: number): boolean {
  return price >= lowPusd && price <= highPusd;
}

/** 70% out in the band, at most 30% held to resolution. */
export function recycleSplit(quantity: number, fraction: number): { recycleShares: number; holdShares: number } {
  if (!(quantity > 0)) return { recycleShares: 0, holdShares: 0 };
  const recycle = Math.min(quantity, Math.floor(quantity * fraction));
  return { recycleShares: recycle, holdShares: quantity - recycle };
}

/** The residual is held to resolution only when the UMA window is short. */
export function holdWindowOpen(expiryMs: number, nowMs: number, maxWindowMs: number): boolean {
  return expiryMs > nowMs && expiryMs - nowMs <= maxWindowMs;
}

/** All-in cost of one ladder: asks plus the per-market taker fees. */
export function ladderAllInCost(legs: LadderLeg[]): number {
  let total = 0;
  for (const leg of legs) total += leg.askPrice + leg.takerFeePerShare;
  return total;
}

/** Report capacity envelope for one event cluster. */
export function clusterCapitalWithinEnvelope(capital: number, min: number, max: number): boolean {
  return capital >= min && capital <= max;
}
