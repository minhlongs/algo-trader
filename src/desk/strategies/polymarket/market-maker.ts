/**
 * Market Maker Strategy — V2 implementation.
 *
 * Provides two-sided liquidity on Polymarket markets by placing
 * bid/ask orders around a fair value estimate. Captures the spread
 * while managing inventory risk, on-chain OFI/VPIN toxicity regime,
 * and optional Log-Odds Avellaneda-Stoikov pricing (`POLY-ALPHA-HUNTER-V4` §3.3, §3.5).
 */

import { EventEmitter } from 'events';
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';
import { calcQuadraticTakerFeeV2, classifyMarketCategory } from '../../polymarket/polymarket-fee-calculator';
import type { StrategyConfig } from '../../core/types';
import { logger } from '../../core/logger';

import {
  type MakerQuoteEconomicsV2,
  type MarketMakerConfig,
  type MmMarket,
  type MmMarketState,
  DEFAULT_CONFIG,
  computeBidPrice,
  computeAskPrice,
  updateSkew,
  computeBestBidAsk,
  computeMakerQuoteEconomicsV2,
} from './market-maker-math';
import {
  LogOddsAvellanedaStoikovMarketMaker,
  VolumeSynchronizedVpinEstimator,
  resolveTickQuotesWithRegime,
  type MarketMakerV2Telemetry,
  type OnchainOrderFilledEvent,
} from './market-maker-v2-quoting';

export {
  type MakerQuoteEconomicsV2,
  type MarketMakerConfig,
  type MarketMakerV2Telemetry,
  type MmMarket,
  type MmMarketState,
  DEFAULT_CONFIG,
  computeBidPrice,
  computeAskPrice,
  updateSkew,
  computeMakerQuoteEconomicsV2,
};

export class MarketMakerStrategy extends EventEmitter {
  private readonly cfg: MarketMakerConfig;
  private readonly capital: string;
  private readonly markets = new Map<string, MmMarketState>();
  private readonly logOddsMmEngine: LogOddsAvellanedaStoikovMarketMaker;
  private running = false;

  constructor(
    private clobClient: ClobClient,
    cfg: StrategyConfig,
    capital: string,
  ) {
    super();
    this.cfg = { ...DEFAULT_CONFIG, ...(cfg.params as Partial<MarketMakerConfig>) };
    this.capital = capital;
    this.logOddsMmEngine = new LogOddsAvellanedaStoikovMarketMaker(this.cfg.logOddsConfig);
    this.running = true;
    logger.info('[market-maker] Strategy initialized', {
      baseSpread: this.cfg.baseSpread,
      quoteSize: this.cfg.quoteSizeUsdc,
      capital: this.capital,
      useLogOddsAsQuoting: this.cfg.useLogOddsAsQuoting,
    });
  }

  /** Add a market to the quoting universe. */
  addMarket(opp: { yesTokenId: string; noTokenId: string; conditionId: string; volume: number; liquidity: number }): void {
    const key = opp.conditionId;
    if (this.markets.has(key)) return;
    this.markets.set(key, {
      info: opp,
      fairValue: 0.5,
      confidence: 0,
      bidPlaced: 0,
      askPlaced: 0,
      inventorySkew: 0,
      category: classifyMarketCategory(opp.conditionId),
      cumulativeRebateUsdc: 0,
      cumulativeAvoidedTakerFeeUsdc: 0,
      vpinEstimator: new VolumeSynchronizedVpinEstimator(
        this.cfg.vpinBucketVolumeMicro ?? 100_000_000,
        this.cfg.vpinRollingWindowBuckets ?? 50,
      ),
      haltedByToxicRegime: false,
    });
    logger.debug('[market-maker] Market added', { key });
  }

  /** Retrieve tracked state and CLOB V2 maker economics for a conditionId. */
  getMarketState(conditionId: string): MmMarketState | undefined {
    return this.markets.get(conditionId);
  }

  /** Feed an on-chain OrderFilled event into a market's volume-synchronized VPIN estimator. */
  recordOnchainFill(conditionId: string, event: OnchainOrderFilledEvent): void {
    this.markets.get(conditionId)?.vpinEstimator?.addTrade(event);
  }

  /** Override VPIN reading for a market (or clear override with undefined). */
  setMarketVpinOverride(conditionId: string, vpin?: number): void {
    const state = this.markets.get(conditionId);
    if (state) state.vpinOverride = vpin;
  }

  /** Set fair value estimate from AI prediction loop. */
  setFairValue(tokenId: string, prob: number, confidence: number): void {
    for (const [, state] of this.markets) {
      if (state.info.yesTokenId === tokenId || state.info.noTokenId === tokenId) {
        state.fairValue = Math.max(0.01, Math.min(0.99, prob));
        state.confidence = confidence;
        return;
      }
    }
  }

  /** Main tick: refresh stale quotes across all markets. */
  async executeTick(): Promise<void> {
    if (!this.running) return;

    const now = Date.now();
    for (const [key, state] of this.markets) {
      if (now - Math.max(state.bidPlaced, state.askPlaced) < this.cfg.refreshIntervalMs) continue;

      try {
        const book = await this.clobClient.getOrderBook(state.info.yesTokenId);
        const ba = this.bestBidAsk(book);

        const totalLiq = parseFloat(book.bids[0]?.size ?? '0') + parseFloat(book.asks[0]?.size ?? '0');
        if (totalLiq < this.cfg.minLiquidity) continue;

        const resolved = resolveTickQuotesWithRegime({
          state,
          book,
          midPrice: ba.mid,
          cfg: this.cfg,
          mmEngine: this.logOddsMmEngine,
        });
        if (resolved.halted) {
          this.emit('toxicKillSwitch', {
            conditionId: key,
            vpin: resolved.telemetry.currentVpin,
            regime: resolved.telemetry.regime,
          });
          continue;
        }

        const { bid, ask } = resolved;
        const category = state.category ?? classifyMarketCategory(key);
        const econ = computeMakerQuoteEconomicsV2(bid, ask, this.cfg.quoteSizeUsdc, category);
        state.lastQuoteEconomics = econ;
        state.bidPlaced = now;
        state.askPlaced = now;

        if (ba.mid >= ask) {
          state.inventorySkew = updateSkew(state.inventorySkew, 'ask');
          state.cumulativeRebateUsdc = (state.cumulativeRebateUsdc ?? 0) + econ.askRebateUsdc;
          state.cumulativeAvoidedTakerFeeUsdc =
            (state.cumulativeAvoidedTakerFeeUsdc ?? 0) +
            calcQuadraticTakerFeeV2(category, ask, econ.askContracts, false) * ask;
          logger.debug('[market-maker] Ask filled', { market: key, price: ask.toFixed(4) });
        } else if (ba.mid <= bid) {
          state.inventorySkew = updateSkew(state.inventorySkew, 'bid');
          state.cumulativeRebateUsdc = (state.cumulativeRebateUsdc ?? 0) + econ.bidRebateUsdc;
          state.cumulativeAvoidedTakerFeeUsdc =
            (state.cumulativeAvoidedTakerFeeUsdc ?? 0) +
            calcQuadraticTakerFeeV2(category, bid, econ.bidContracts, false) * bid;
          logger.debug('[market-maker] Bid filled', { market: key, price: bid.toFixed(4) });
        }
      } catch {
        continue;
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.markets.clear();
    logger.info('[market-maker] Stopped');
  }

  private bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
    return computeBestBidAsk(book);
  }
}
