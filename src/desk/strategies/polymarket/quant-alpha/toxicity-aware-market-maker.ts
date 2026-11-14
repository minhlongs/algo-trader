/**
 * Toxicity-Aware Market Maker (report: "Strategy 3").
 *
 * Quotes cash-collateralised YES+NO pairs strictly below 1.00 pUSD while order
 * flow stays non-toxic; refuses markets whose fee schedule cannot be resolved.
 */

import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { RawOrderBook } from '../../../polymarket/clob-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import { calcMakerRebatePerShare, type PolymarketFeeSchedule } from '../../../polymarket/polymarket-fee-calculator';
import { logger } from '../../../core/logger';
import { BasePolymarketStrategy, type OpenPosition, type StrategyDeps } from '../base-polymarket-strategy';
import { DEFAULT_CONFIG, STRATEGY_NAME, type PairQuote, type ToxicityAwareConfig } from './toxicity-aware-market-maker-types';
import {
  bestBidPrice, isCloseToExpiry, isPairArbitrage, markoutBps,
  pairCostPusd, quotePrice, rewardPerVolatility, topFractionByScore,
} from './toxicity-aware-market-maker-math';
import { QuoteBook, type QuoteFill } from './toxicity-aware-market-maker-state';
import { PairLegExecutor, type ExecutedLeg } from './toxicity-aware-market-maker-leg-executor';
import { resolveStrategyFeeSchedule } from './quant-alpha-fee-schedule';

export type { ToxicityAwareConfig, PairQuote, QuotePlacement } from './toxicity-aware-market-maker-types';
export { DEFAULT_CONFIG, STRATEGY_NAME } from './toxicity-aware-market-maker-types';
export * from './toxicity-aware-market-maker-math';

/** `StrategyDeps` is fixed at four members, so the resolver rides alongside it. */
export interface ToxicityAwareMarketMakerDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
}

export class ToxicityAwareMarketMakerStrategy extends BasePolymarketStrategy {
  private readonly cfg: ToxicityAwareConfig;
  private readonly feeResolver?: FeeScheduleResolver;
  private readonly state = new QuoteBook();
  private readonly legs: PairLegExecutor;

  constructor(deps: ToxicityAwareMarketMakerDeps, config: Partial<ToxicityAwareConfig> = {}) {
    const fullConfig: ToxicityAwareConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.feeResolver = deps.feeResolver;
    this.legs = new PairLegExecutor({
      clob: deps.clob,
      orderManager: deps.orderManager,
      strategyName: this.strategyName,
      config: fullConfig,
      onFill: (leg) => this.recordLeg(leg),
    });
  }

  /** Close a leg the moment the book turns toxic against it. No side effects. */
  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book || book.bids.length === 0) return { exit: false, reason: '' };
    const toxic = this.state.readToxicity(pos.tokenId, book, this.cfg, false);
    return toxic
      ? { exit: true, reason: 'toxic-flow-against-leg' }
      : { exit: false, reason: '' };
  }

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    const now = Date.now();
    this.state.rollDay(now);
    await this.refreshMarkouts();
    if (this.state.isKilled(now, this.cfg)) return;

    const candidates: PairQuote[] = [];
    for (const market of markets) {
      const quote = await this.evaluate(market, now);
      if (quote) candidates.push(quote);
    }
    const chosen = topFractionByScore(
      candidates.map((quote) => ({ item: quote, score: quote.rankScore })),
      this.cfg.marketSelectionTopFraction,
    );
    for (const quote of chosen) {
      if (this.getPositionCount() >= this.cfg.maxPositions) return;
      await this.legs.postPair(quote, now);
    }
  }

  /** Everything a pair quote needs, or `null` when any gate declines the market. */
  private async evaluate(market: GammaMarket, now: number): Promise<PairQuote | null> {
    const noTokenId = market.noTokenId;
    if (!market.yesTokenId || !noTokenId || market.closed || market.resolved) return null;
    if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId, now)) return null;
    if ((market.volume ?? 0) < this.cfg.minVolume) return null;
    if (isCloseToExpiry(market.endDate, now, this.cfg.minTimeToExpiryMs)) return null;

    try {
      const yesBook = await this.deps.clob.getOrderBook(market.yesTokenId);
      const noBook = await this.deps.clob.getOrderBook(noTokenId);
      if (yesBook.bids.length === 0 || noBook.bids.length === 0) return null;
      if (this.state.readToxicity(market.yesTokenId, yesBook, this.cfg, true)) return null;
      if (this.state.readToxicity(noTokenId, noBook, this.cfg, true)) return null;

      const yesBidPrice = quotePrice('buy', bestBidPrice(yesBook.bids), this.cfg.quotePlacement, this.cfg.tickSize);
      const noBidPrice = quotePrice('buy', bestBidPrice(noBook.bids), this.cfg.quotePlacement, this.cfg.tickSize);
      const yesAsk = this.bestBidAsk(yesBook).ask;
      const noAsk = this.bestBidAsk(noBook).ask;
      if (yesAsk > 0 && !(yesBidPrice < yesAsk - 1e-9)) return null;
      if (noAsk > 0 && !(noBidPrice < noAsk - 1e-9)) return null;
      if (!isPairArbitrage({ yesBidPrice, noBidPrice }, this.cfg.maxPairCostPusd)) return null;

      const yesSchedule = await resolveStrategyFeeSchedule(this.feeResolver, market.yesTokenId, this.strategyName);
      const noSchedule = await resolveStrategyFeeSchedule(this.feeResolver, noTokenId, this.strategyName);
      if (!yesSchedule || !noSchedule) return null;

      const realizedVol = this.state.recordYesPrice(market.yesTokenId, yesBidPrice, this.cfg.volatilityLookback);
      const rewardPlusRebate = this.rankReward(yesSchedule, yesBidPrice, noSchedule, noBidPrice);
      return {
        tokenId: market.yesTokenId,
        noTokenId,
        conditionId: market.conditionId,
        fairMid: this.bestBidAsk(yesBook).mid,
        yesBidPrice,
        yesNotionalPusd: this.cfg.legNotionalPusd,
        noBidPrice,
        noNotionalPusd: this.cfg.legNotionalPusd,
        pairCostPusd: pairCostPusd(yesBidPrice, noBidPrice),
        rewardPlusRebate,
        realizedVol,
        rankScore: rewardPerVolatility(0, rewardPlusRebate, realizedVol),
      };
    } catch (err) {
      logger.debug('Quote scan failed', this.strategyName, { market: market.conditionId, err: String(err) });
      return null;
    }
  }

  /** Maker rebate in pUSD across both legs using share counts (`legNotional / price`). */
  private rankReward(
    yesSchedule: PolymarketFeeSchedule,
    yesPrice: number,
    noSchedule: PolymarketFeeSchedule,
    noPrice: number,
  ): number {
    const yesShares = yesPrice > 0 ? this.cfg.legNotionalPusd / yesPrice : 0;
    const noShares = noPrice > 0 ? this.cfg.legNotionalPusd / noPrice : 0;
    return (
      calcMakerRebatePerShare(yesSchedule, yesPrice) * yesShares +
      calcMakerRebatePerShare(noSchedule, noPrice) * noShares
    );
  }

  /** Own both writes for a confirmed leg: the position book and the trade event. */
  private recordLeg(leg: ExecutedLeg): void {
    this.positions.push(this.state.recordFill(leg));
    this.emitTrade({
      orderId: leg.orderId,
      marketId: leg.conditionId,
      side: 'buy',
      fillPrice: leg.price.toFixed(4),
      fillSize: (leg.quantity * leg.price).toFixed(2),
      fees: leg.fees ?? '0',
      timestamp: leg.atMs,
      strategy: this.strategyName,
    });
  }

  /** Mark open legs at the current mid so the daily-loss and kill checks see reality. */
  private async refreshMarkouts(): Promise<void> {
    for (const fill of this.state.fills) {
      const price = await this.getCurrentPrice(fill.tokenId);
      if (price.mid > 0) fill.markoutBps = markoutBps(fill.entryPrice, price.mid, fill.side);
    }
  }

  /** Today's fill markouts, fill records, and kill state for KPI governance. */
  getMarkoutTelemetry(nowMs = Date.now()): {
    markoutsBps: number[];
    fills: QuoteFill[];
    killed: boolean;
  } {
    return {
      markoutsBps: this.state.fills.map((f) => f.markoutBps),
      fills: this.state.fills.map((f) => ({ ...f })),
      killed: this.state.isKilled(nowMs, this.cfg) !== null,
    };
  }
}

export function createToxicityAwareMarketMakerTick(deps: ToxicityAwareMarketMakerDeps): () => Promise<void> {
  const strategy = new ToxicityAwareMarketMakerStrategy(deps);
  return strategy.toTickFn();
}
