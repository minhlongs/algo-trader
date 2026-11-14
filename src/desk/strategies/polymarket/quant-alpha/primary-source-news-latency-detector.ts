/**
 * Detection and ladder building for Primary-Source News-to-Probability Latency.
 *
 * `verifyBulletin` runs both classifier streams concurrently and accepts only
 * absolute consensus inside the dual-verify window. `buildLadder` turns one
 * Gamma event into the deadline ladder the sweep will cross: every open
 * contract resolving inside the horizon, priced off its own ask book, with the
 * taker fee its own market publishes. A Geopolitics market's zero fee falls
 * out of the resolved schedule (`rate: 0`), not out of a category branch.
 */

import type { ClobClient } from '../../../polymarket/clob-client';
import type { GammaEvent, GammaMarket } from '../../../polymarket/gamma-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import { calcTakerFeePerShare } from '../../../polymarket/polymarket-fee-calculator';
import { logger } from '../../../core/logger';
import { resolveStrategyFeeSchedule } from './quant-alpha-fee-schedule';
import { bestAskPrice, sizeAtLevel } from './negrisk-bundle-arbitrage-math';
import type {
  Bulletin,
  LadderLeg,
  MarketCheck,
  NewsStreams,
  PrimarySourceNewsLatencyConfig,
} from './primary-source-news-latency-types';
import {
  absoluteConsensus,
  entryPriceEligible,
  ladderHorizonOk,
  withinDualVerifyWindow,
} from './primary-source-news-latency-math';

export interface Verification {
  confirmed: boolean;
  elapsedMs: number;
  reason: string;
}

/** Both streams, in parallel, timed together against the 800 ms window. */
export async function verifyBulletin(
  bulletin: Bulletin,
  check: MarketCheck,
  streams: NewsStreams,
  config: PrimarySourceNewsLatencyConfig,
  clock: () => number,
): Promise<Verification> {
  const started = clock();
  let verdicts: Awaited<ReturnType<NewsStreams['term']>>[];
  try {
    verdicts = await Promise.all([streams.term(bulletin, check), streams.numeric(bulletin, check)]);
  } catch (err) {
    return { confirmed: false, elapsedMs: clock() - started, reason: `stream error: ${String(err)}` };
  }
  const elapsedMs = clock() - started;
  const [term, numeric] = verdicts;
  if (!withinDualVerifyWindow(elapsedMs, config.dualVerifyWindowMs)) {
    return { confirmed: false, elapsedMs, reason: `streams took ${elapsedMs} ms` };
  }
  const confirmed = absoluteConsensus(term, numeric, config.minStreamConfidence);
  return { confirmed, elapsedMs, reason: `term: ${term.reason}; numeric: ${numeric.reason}` };
}

export interface LadderOptions {
  clob: ClobClient;
  feeResolver: FeeScheduleResolver | undefined;
  strategyName: string;
  config: PrimarySourceNewsLatencyConfig;
}

/** Contracts of one event that can still resolve inside the ladder horizon. */
export function ladderMarkets(event: GammaEvent, nowMs: number, maxHorizonMs: number): GammaMarket[] {
  return event.markets
    .filter((market) => !market.closed && market.resolved !== true && market.yesTokenId)
    .filter((market) => ladderHorizonOk(expiryOf(market), nowMs, maxHorizonMs))
    .sort((left, right) => expiryOf(left) - expiryOf(right));
}

/**
 * Price every ladder contract. A leg with an empty ask side, a price outside
 * [min, p_max] or an unknown fee schedule is dropped; it is never priced from
 * a guess. The caller decides whether what remains is still a ladder.
 */
export async function buildLadder(event: GammaEvent, nowMs: number, options: LadderOptions): Promise<LadderLeg[]> {
  const { config } = options;
  const legs: LadderLeg[] = [];
  for (const market of ladderMarkets(event, nowMs, config.ladderMaxHorizonMs)) {
    if (legs.length >= config.maxLadderLegs) break;
    const leg = await priceLadderLeg(market, options);
    if (leg) legs.push(leg);
  }
  return legs;
}

async function priceLadderLeg(market: GammaMarket, options: LadderOptions): Promise<LadderLeg | null> {
  const { config } = options;
  let asks;
  try {
    asks = (await options.clob.getOrderBook(market.yesTokenId)).asks;
  } catch (err) {
    logger.debug('Ladder book unavailable', options.strategyName, { tokenId: market.yesTokenId, err: String(err) });
    return null;
  }
  const askPrice = bestAskPrice(asks, config.tickSize);
  if (!(askPrice > 0) || !entryPriceEligible(askPrice, config)) return null;
  const displayedShares = sizeAtLevel(asks, askPrice);
  if (!(displayedShares > 0)) return null;
  const schedule = await resolveStrategyFeeSchedule(options.feeResolver, market.yesTokenId, options.strategyName);
  // Unknown cost is not a cost of zero.
  if (!schedule) return null;
  return {
    tokenId: market.yesTokenId,
    conditionId: market.conditionId,
    outcome: market.groupItemTitle ?? market.question,
    askPrice,
    displayedShares,
    takerFeePerShare: calcTakerFeePerShare(schedule, askPrice),
    expiryMs: expiryOf(market),
  };
}

/** `endDate` parsed once; an unparseable date is no expiry, so it never qualifies. */
function expiryOf(market: GammaMarket): number {
  const parsed = Date.parse(market.endDate);
  return Number.isFinite(parsed) ? parsed : 0;
}
