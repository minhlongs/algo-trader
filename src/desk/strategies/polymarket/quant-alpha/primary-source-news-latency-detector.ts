/**
 * Detection and ladder building for Primary-Source News-to-Probability Latency.
 *
 * `verifyBulletin` strictly enforces the normalized `allowedSourceHosts`
 * whitelist before invoking any classifier, runs `term` and `numeric` streams
 * concurrently inside `dualVerifyWindowMs`, and optionally resolves 1-of-2
 * split disagreements via a 3rd `arbiter` stream within the remaining budget.
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
  containsTerm,
  entryPriceEligible,
  ladderHorizonOk,
  normaliseText,
  withinDualVerifyWindow,
} from './primary-source-news-latency-math';

export interface Verification {
  confirmed: boolean;
  elapsedMs: number;
  reason: string;
}

function normalizeHost(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  try {
    const parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    if (!hasScheme && (parsed.pathname !== '/' || parsed.search || parsed.hash)) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeUrlHost(rawUrl: string): string {
  const candidate = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (parsed.username || parsed.password) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isBulletinSourceWhitelisted(bulletin: Bulletin, check: MarketCheck): boolean {
  if (check.allowedSourceHosts.length === 0) return false;
  const allowed = new Set(check.allowedSourceHosts.map(normalizeHost).filter((h) => h.length > 0));
  if (allowed.size === 0) return false;
  const host = normalizeHost(bulletin.sourceHost);
  if (!host || !allowed.has(host)) return false;
  const rawUrl = bulletin.url?.trim() ?? '';
  if (rawUrl.length > 0) {
    const urlHost = normalizeUrlHost(rawUrl);
    if (!urlHost || !allowed.has(urlHost)) return false;
  }
  return true;
}

/** Pre-screens source host & forbidden terms, runs dual streams in parallel, and arbitrates 1-of-2 splits if opted in. */
export async function verifyBulletin(
  bulletin: Bulletin,
  check: MarketCheck,
  streams: NewsStreams,
  config: PrimarySourceNewsLatencyConfig,
  clock: () => number,
): Promise<Verification> {
  if (!isBulletinSourceWhitelisted(bulletin, check)) {
    return { confirmed: false, elapsedMs: 0, reason: 'unwhitelisted-source-host' };
  }
  const normalizedCorpus = normaliseText(`${bulletin.title} ${bulletin.body}`);
  const vetoTerm = check.forbiddenTerms.find((term) => containsTerm(normalizedCorpus, term));
  if (vetoTerm) {
    return { confirmed: false, elapsedMs: 0, reason: `forbidden-term-veto: ${vetoTerm}` };
  }
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
  if (absoluteConsensus(term, numeric, config.minStreamConfidence)) {
    return { confirmed: true, elapsedMs, reason: `term: ${term.reason}; numeric: ${numeric.reason}` };
  }

  const termOk = term.matches && term.confidence >= config.minStreamConfidence;
  const numericOk = numeric.matches && numeric.confidence >= config.minStreamConfidence;
  const affirmativeHasCriteria =
    (termOk && !numericOk && check.requiredTerms.length > 0) ||
    (numericOk && !termOk && check.requiredNumbers.length > 0);
  const arbiterOptedIn = config.requireArbiterOnSplit === true || config.allowArbiterTiebreak === true;

  if (affirmativeHasCriteria && arbiterOptedIn && streams.arbiter) {
    let arbiterVerdict: Awaited<ReturnType<NewsStreams['term']>>;
    try {
      arbiterVerdict = await streams.arbiter(bulletin, check);
    } catch (err) {
      return { confirmed: false, elapsedMs: clock() - started, reason: `arbiter error: ${String(err)}` };
    }
    const totalElapsedMs = clock() - started;
    if (!withinDualVerifyWindow(totalElapsedMs, config.dualVerifyWindowMs)) {
      return { confirmed: false, elapsedMs: totalElapsedMs, reason: `arbiter exceeded window (${totalElapsedMs} ms)` };
    }
    const arbiterOk = arbiterVerdict.matches && arbiterVerdict.confidence >= config.minStreamConfidence;
    return {
      confirmed: arbiterOk,
      elapsedMs: totalElapsedMs,
      reason: `term: ${term.reason}; numeric: ${numeric.reason}; arbiter: ${arbiterVerdict.reason}`,
    };
  }

  return { confirmed: false, elapsedMs, reason: `term: ${term.reason}; numeric: ${numeric.reason}` };
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

function expiryOf(market: GammaMarket): number {
  const parsed = Date.parse(market.endDate);
  return Number.isFinite(parsed) ? parsed : 0;
}
