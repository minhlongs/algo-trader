/**
 * Rolling market state for the toxicity-aware market maker.
 *
 * Every buffer here is bounded by a config field, so a long paper session does
 * not grow without limit. Nothing in this module decides whether to trade; it
 * only remembers what the decision path already saw.
 *
 * At most one YES fill and one NO fill exist per `conditionId`, and no other
 * symbol in the file stores which of the two arrived first: a partially
 * completed pair is the one case where "first" would be a directional claim.
 */

import type { RawOrderBook } from '../../../polymarket/clob-client';
import type { OpenPosition } from '../base-polymarket-strategy';
import { calcToxicityZScore, calcVPIN, estimateTradeImbalance } from '../order-flow-toxicity-math';
import { calcRealizedVol } from '../strategy-math-helpers';
import {
  appendCapped,
  countAdverseOneSidedFills,
  topLevels,
} from './toxicity-aware-market-maker-math';
import type { ExecutedLeg } from './toxicity-aware-market-maker-leg-executor';

/** One side of a pair quote that has actually filled. */
export interface QuoteFill {
  tokenId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  /** Updated on every scan so the kill check sees the current, not entry, mark. */
  markoutBps: number;
  atMs: number;
}

const DAY_MS = 86_400_000;

export class QuoteBook {
  private readonly books = new Map<string, RawOrderBook>();
  private readonly imbalanceHistory = new Map<string, number[]>();
  private readonly vpinHistoryByToken = new Map<string, number[]>();
  private readonly priceHistory = new Map<string, number[]>();
  private dayStartMs = Date.now();

  /** Fills placed today, mutated in place by the markout refresh. */
  readonly fills: QuoteFill[] = [];

  getBook(tokenId: string): RawOrderBook | undefined {
    return this.books.get(tokenId);
  }

  setBook(tokenId: string, book: RawOrderBook): void {
    this.books.set(tokenId, book);
  }

  /** Trade-imbalance samples, newest last. `remember` false is a read-only dry run. */
  pushImbalance(tokenId: string, value: number, max: number, remember: boolean): number[] {
    return this.append(this.imbalanceHistory, tokenId, value, max, remember);
  }

  /** VPIN samples already seen, used as the z-score reference distribution. */
  vpinHistory(tokenId: string): number[] {
    return this.vpinHistoryByToken.get(tokenId) ?? [];
  }

  pushVpin(tokenId: string, value: number, max: number, remember: boolean): number[] {
    return this.append(this.vpinHistoryByToken, tokenId, value, max, remember);
  }

  /** Record a YES bid and return realized volatility over the retained window. */
  recordYesPrice(tokenId: string, price: number, lookback: number): number {
    if (price > 0) this.append(this.priceHistory, tokenId, price, lookback, true);
    return calcRealizedVol(this.priceHistory.get(tokenId) ?? []);
  }

  /** Clear the day's fills when the wall clock crosses midnight since the last scan. */
  rollDay(nowMs: number): void {
    if (nowMs - this.dayStartMs <= DAY_MS) return;
    this.dayStartMs = nowMs;
    this.fills.length = 0;
  }

  /** Age of the current trading day, for diagnostics and tests. */
  get dayOpenedAtMs(): number {
    return this.dayStartMs;
  }

  /**
   * VPIN and trade-imbalance z-score for one token, true when the flow is toxic.
   *
   * `calcVPIN` answers 0.5 for an empty window and `calcToxicityZScore` returns
   * a magnitude, so both are compared as magnitudes and never as a signed value.
   * `remember` is false on the exit path: an exit check must not advance history.
   */
  readToxicity(tokenId: string, book: RawOrderBook, limits: ToxicityLimits, remember: boolean): boolean {
    const prev = this.books.get(tokenId);
    if (remember) this.books.set(tokenId, book);
    if (!prev) return false;
    const depth = limits.toxicityDepthLevels;
    const imbalance = estimateTradeImbalance(
      { ...prev, bids: topLevels(prev.bids, depth, 'bid'), asks: topLevels(prev.asks, depth, 'ask') },
      { ...book, bids: topLevels(book.bids, depth, 'bid'), asks: topLevels(book.asks, depth, 'ask') },
    );
    const history = this.pushImbalance(tokenId, imbalance, limits.toxicityLookback, remember);
    const vpin = calcVPIN([...history]);
    const zScore = Math.abs(calcToxicityZScore(vpin, this.vpinHistory(tokenId)));
    this.pushVpin(tokenId, vpin, limits.toxicityLookback, remember);
    return vpin > limits.maxToxicityVpin || zScore > limits.maxToxicityZScore;
  }

  /**
   * Record a confirmed leg: one open position for the book, one fill for the kill check.
   * Both legs are long ERC-1155 BUYs (`yesTokenId` or `noTokenId`), so `OpenPosition.side`
   * uses long-token polarity (`'yes'`) while `QuoteFill.side` retains `'yes' | 'no'` for
   * the one-directional adverse fill detector.
   */
  recordFill(leg: ExecutedLeg): OpenPosition {
    const position: OpenPosition = {
      tokenId: leg.tokenId,
      conditionId: leg.conditionId,
      side: 'yes',
      entryPrice: leg.price,
      sizeUsdc: leg.quantity * leg.price,
      tokenQuantity: leg.quantity,
      entryFeesUsdc: parseFloat(leg.fees ?? '0') || 0,
      orderId: leg.orderId,
      openedAt: leg.atMs,
    };
    this.fills.push({
      tokenId: leg.tokenId,
      side: leg.side,
      entryPrice: leg.price,
      markoutBps: 0,
      atMs: leg.atMs,
    });
    return position;
  }

  /**
   * The report's two kill conditions.
   *
   * Adverse one-directional flow trips first because it is the leading
   * indicator; the daily loss cap is the backstop. Both are evaluated against
   * today's fills only, so a kill cannot be inherited from yesterday.
   */
  isKilled(nowMs: number, limits: KillLimits): KillReason | null {
    const todays = this.fills.filter((fill) => fill.atMs >= this.dayStartMs);
    if (countAdverseOneSidedFills(todays, nowMs, limits.markoutHorizonMs, limits.maxOneDirectionalFillsPerMin)) {
      return 'one-directional-adverse-fills';
    }
    let loss = 0;
    for (const fill of todays) {
      if (!(fill.markoutBps < 0)) continue;
      loss += (-fill.markoutBps / 10_000) * limits.legNotionalPusd;
    }
    const cap = limits.dailyLossLimitPct * limits.legNotionalPusd * limits.maxPositions;
    return loss > cap ? 'daily-loss-limit' : null;
  }

  private append(
    map: Map<string, number[]>,
    key: string,
    value: number,
    max: number,
    remember: boolean,
  ): number[] {
    const bounded = appendCapped(map.get(key) ?? [], value, max);
    if (remember) map.set(key, bounded);
    return bounded;
  }
}

/** The config subset the toxicity read needs. */
export interface ToxicityLimits {
  toxicityDepthLevels: number;
  toxicityLookback: number;
  maxToxicityVpin: number;
  maxToxicityZScore: number;
}

/** The subset of the strategy config the kill check reads. */
export interface KillLimits {
  markoutHorizonMs: number;
  maxOneDirectionalFillsPerMin: number;
  dailyLossLimitPct: number;
  legNotionalPusd: number;
  maxPositions: number;
}

export type KillReason = 'one-directional-adverse-fills' | 'daily-loss-limit';
