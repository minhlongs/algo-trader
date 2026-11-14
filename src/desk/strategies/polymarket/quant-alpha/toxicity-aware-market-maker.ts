/**
 * Toxicity-Aware Market Maker (report: "Strategy 3" + "Strategy 7" Regime Policy).
 *
 * Quotes cash-collateralised YES+NO pairs strictly below 1.00 pUSD under Strategy 7
 * 5-state liquidity regime governance (`QUIET`, `TRENDING`, `EVENT`, `REDUCE_ONLY`, `HALTED`)
 * and hard 5-minute crypto contract exclusion.
 */

import type { GammaMarket } from '../../../polymarket/gamma-client';
import type { RawOrderBook } from '../../../polymarket/clob-client';
import type { FeeScheduleResolver } from '../../../polymarket/fee-schedule-resolver';
import type { CtfEthCallPreflight } from '../../../polymarket/ctf-eth-call-preflight';
import { isFiveMinuteCryptoMarket } from '../../../polymarket/five-minute-crypto-guard';
import { LiquidityRegimeMachine } from '../../../polymarket/liquidity-regime-machine';
import { logger } from '../../../core/logger';
import { BasePolymarketStrategy, type OpenPosition, type StrategyDeps } from '../base-polymarket-strategy';
import {
  DEFAULT_CONFIG, STRATEGY_NAME,
  type MakerRegimeTelemetry, type MergeEligiblePairEvent, type PairQuote, type ToxicityAwareConfig,
} from './toxicity-aware-market-maker-types';
import {
  bestBidPrice, isCloseToExpiry, isPairArbitrage, markoutBps,
  pairCostPusd, quotePrice, rewardPerVolatility, topFractionByScore,
} from './toxicity-aware-market-maker-math';
import { QuoteBook, type QuoteFill } from './toxicity-aware-market-maker-state';
import { PairLegExecutor, type ExecutedLeg } from './toxicity-aware-market-maker-leg-executor';
import { resolveStrategyFeeSchedule } from './quant-alpha-fee-schedule';
import {
  MakerRegimeCoordinator, calcPairMakerRebatePusd, widenBidForRegime, type ExternalRegimeFeed,
} from './toxicity-aware-market-maker-regime-wiring';

export type {
  ToxicityAwareConfig, PairQuote, QuotePlacement,
  MakerRegimeTelemetry, MergeEligiblePair, MergeEligiblePairEvent,
} from './toxicity-aware-market-maker-types';
export { DEFAULT_CONFIG, STRATEGY_NAME } from './toxicity-aware-market-maker-types';
export * from './toxicity-aware-market-maker-math';

export interface ToxicityAwareMarketMakerDeps extends StrategyDeps {
  feeResolver?: FeeScheduleResolver;
  regimeMachine?: LiquidityRegimeMachine;
  ctfPreflight?: CtfEthCallPreflight;
  onMergePair?: (
    event: MergeEligiblePairEvent,
  ) => Promise<{ merged?: boolean } | void> | { merged?: boolean } | void;
}

export class ToxicityAwareMarketMakerStrategy extends BasePolymarketStrategy {
  private readonly cfg: ToxicityAwareConfig;
  private readonly feeResolver?: FeeScheduleResolver;
  private readonly state = new QuoteBook();
  private readonly legs: PairLegExecutor;
  private readonly regimeMachine: LiquidityRegimeMachine;
  private readonly regimeCoord: MakerRegimeCoordinator;
  private readonly tokenPairs = new Map<string, { yes: string; no: string }>();

  constructor(deps: ToxicityAwareMarketMakerDeps, config: Partial<ToxicityAwareConfig> = {}) {
    const fullConfig: ToxicityAwareConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.feeResolver = deps.feeResolver;
    this.regimeMachine = deps.regimeMachine ?? new LiquidityRegimeMachine({ config: fullConfig.regimeConfig });
    this.regimeCoord = new MakerRegimeCoordinator(
      this.regimeMachine, fullConfig, deps.orderManager, deps.ctfPreflight, deps.onMergePair,
    );
    this.legs = new PairLegExecutor({
      clob: deps.clob,
      orderManager: deps.orderManager,
      strategyName: this.strategyName,
      config: fullConfig,
      onFill: (leg) => this.recordLeg(leg),
    });
  }

  updateRegimeObservation(marketId: string, obs: ExternalRegimeFeed): void {
    this.regimeCoord.updateObservation(marketId, obs);
  }

  protected getCustomExitCondition(
    pos: OpenPosition, _currentPrice: number, book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book || book.bids.length === 0) return { exit: false, reason: '' };
    return this.state.readToxicity(pos.tokenId, book, this.cfg, false)
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
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      this.tokenPairs.set(quote.conditionId, { yes: quote.tokenId, no: quote.noTokenId });
      await this.legs.postPair(quote, now);
    }
    await this.regimeCoord.processEligibleMerges(this.positions);
  }

  private async evaluate(market: GammaMarket, now: number): Promise<PairQuote | null> {
    if (isFiveMinuteCryptoMarket(market)) {
      this.regimeCoord.noteExcludedFiveMinuteMarket();
      return null;
    }
    const noTokenId = market.noTokenId;
    if (!market.yesTokenId || !noTokenId || market.closed || market.resolved) return null;
    if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId, now)) return null;
    if ((market.volume ?? 0) < this.cfg.minVolume) return null;
    if (!Number.isFinite(Date.parse(market.endDate))) return null;

    try {
      const yesBook = await this.deps.clob.getOrderBook(market.yesTokenId);
      const noBook = await this.deps.clob.getOrderBook(noTokenId);
      const yesTop = this.bestBidAsk(yesBook);
      const noTop = this.bestBidAsk(noBook);
      const decision = await this.regimeCoord.evaluateMarketRegime(market, now, this.state.fills, yesTop.mid);
      if (!decision.allowNewQuotes) return null;
      if (isCloseToExpiry(market.endDate, now, this.cfg.minTimeToExpiryMs)) return null;
      if (yesBook.bids.length === 0 || noBook.bids.length === 0) return null;
      if (this.state.readToxicity(market.yesTokenId, yesBook, this.cfg, true)) return null;
      if (this.state.readToxicity(noTokenId, noBook, this.cfg, true)) return null;

      const baseYesBid = quotePrice('buy', bestBidPrice(yesBook.bids), this.cfg.quotePlacement, this.cfg.tickSize);
      const baseNoBid = quotePrice('buy', bestBidPrice(noBook.bids), this.cfg.quotePlacement, this.cfg.tickSize);
      const yesBidPrice = widenBidForRegime(baseYesBid, yesTop.mid, decision.spreadMultiplier, this.cfg.quoteTicks, this.cfg.tickSize);
      const noBidPrice = widenBidForRegime(baseNoBid, noTop.mid, decision.spreadMultiplier, this.cfg.quoteTicks, this.cfg.tickSize);
      if (!(yesBidPrice > 0) || !(noBidPrice > 0)) return null;
      if (yesTop.ask > 0 && !(yesBidPrice < yesTop.ask - 1e-9)) return null;
      if (noTop.ask > 0 && !(noBidPrice < noTop.ask - 1e-9)) return null;
      if (!isPairArbitrage({ yesBidPrice, noBidPrice }, this.cfg.maxPairCostPusd)) return null;

      const yesSchedule = await resolveStrategyFeeSchedule(this.feeResolver, market.yesTokenId, this.strategyName);
      const noSchedule = await resolveStrategyFeeSchedule(this.feeResolver, noTokenId, this.strategyName);
      if (!yesSchedule || !noSchedule) return null;

      const legNotional = this.cfg.legNotionalPusd * decision.sizeMultiplier;
      const realizedVol = this.state.recordYesPrice(market.yesTokenId, yesBidPrice, this.cfg.volatilityLookback);
      const rewardPlusRebate = calcPairMakerRebatePusd(yesSchedule, yesBidPrice, noSchedule, noBidPrice, legNotional);
      return {
        tokenId: market.yesTokenId, noTokenId, conditionId: market.conditionId,
        fairMid: yesTop.mid, yesBidPrice, yesNotionalPusd: legNotional,
        noBidPrice, noNotionalPusd: legNotional, pairCostPusd: pairCostPusd(yesBidPrice, noBidPrice),
        rewardPlusRebate, realizedVol, rankScore: rewardPerVolatility(0, rewardPlusRebate, realizedVol),
      };
    } catch (err) {
      this.regimeMachine.recordApiError(now);
      logger.debug('Quote scan failed', this.strategyName, { market: market.conditionId, err: String(err) });
      return null;
    }
  }

  private recordLeg(leg: ExecutedLeg): void {
    this.positions.push(this.state.recordFill(leg));
    const pair = this.tokenPairs.get(leg.conditionId) ?? { yes: leg.tokenId, no: leg.tokenId };
    this.regimeCoord.recordFilledLeg(leg, pair.yes, pair.no);
    this.emitTrade({
      orderId: leg.orderId, marketId: leg.conditionId, side: 'buy',
      fillPrice: leg.price.toFixed(4), fillSize: (leg.quantity * leg.price).toFixed(2),
      fees: leg.fees ?? '0', timestamp: leg.atMs, strategy: this.strategyName,
    });
  }

  private async refreshMarkouts(): Promise<void> {
    for (const fill of this.state.fills) {
      const price = await this.getCurrentPrice(fill.tokenId);
      if (price.mid > 0) fill.markoutBps = markoutBps(fill.entryPrice, price.mid, fill.side);
    }
  }

  getMarkoutTelemetry(nowMs = Date.now()): { markoutsBps: number[]; fills: QuoteFill[]; killed: boolean } {
    return {
      markoutsBps: this.state.fills.map((f) => f.markoutBps),
      fills: this.state.fills.map((f) => ({ ...f })),
      killed: this.state.isKilled(nowMs, this.cfg) !== null,
    };
  }

  getRegimeTelemetry(nowMs = Date.now()): MakerRegimeTelemetry {
    return this.regimeCoord.getTelemetry(nowMs);
  }
}

export function createToxicityAwareMarketMakerTick(deps: ToxicityAwareMarketMakerDeps): () => Promise<void> {
  return new ToxicityAwareMarketMakerStrategy(deps).toTickFn();
}
