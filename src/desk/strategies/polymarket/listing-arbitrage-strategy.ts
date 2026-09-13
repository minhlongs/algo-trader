/**
 * Listing Arbitrage Sniper — Strategy Implementation & Tick Factory
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';
import {
  type ListingArbConfig,
  DEFAULT_LISTING_ARB_CONFIG,
  STRATEGY_NAME,
  type ListingArbDeps,
} from './listing-arbitrage-types';
import {
  computeSpreadRatio,
  isSpreadWide,
} from './listing-arbitrage-math';

export class ListingArbitrageSniper extends BasePolymarketStrategy {
  private readonly cfg: ListingArbConfig;
  /** market conditionId → first-seen timestamp (ms) */
  private readonly observedMarkets = new Map<string, number>();
  /** timestamp of last entry (ms) — global cooldown */
  private lastEntryTime = 0;
  private readonly getTime: () => number;

  constructor(
    deps: StrategyDeps,
    config: Partial<ListingArbConfig> = {},
    clock?: () => number,
  ) {
    const fullConfig: ListingArbConfig = { ...DEFAULT_LISTING_ARB_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
    this.getTime = typeof clock === 'function' ? clock : () => Date.now();
  }

  // ── Market age tracking ───────────────────────────────────────────────────

  private observeMarket(conditionId: string): void {
    if (!this.observedMarkets.has(conditionId)) {
      this.observedMarkets.set(conditionId, this.getTime());
    }
  }

  private getMarketAgeMs(conditionId: string): number | null {
    const firstSeen = this.observedMarkets.get(conditionId);
    if (!firstSeen) return null;
    return this.getTime() - firstSeen;
  }

  private isGlobalCooldown(): boolean {
    return this.getTime() - this.lastEntryTime < this.cfg.globalCooldownMs;
  }

  // ── Custom exit conditions ────────────────────────────────────────────────

  /**
   * Spread convergence exit: when the bid-ask spread of the position's token
   * tightens below 1% it signals liquidity has arrived.
   */
  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (book && book.bids.length > 0 && book.asks.length > 0) {
      const bid = parseFloat(book.bids[0].price);
      const ask = parseFloat(book.asks[0].price);
      if (bid > 0 && ask > bid && (ask - bid) / bid < 0.01) {
        return { exit: true, reason: 'spread converged' };
      }
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ────────────────────────────────────────────────────────

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions || this.isGlobalCooldown()) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (market.closed || market.resolved || !market.yesTokenId || !market.noTokenId) continue;
      if (this.hasPosition(market.conditionId) || this.isOnCooldown(market.conditionId)) continue;

      this.observeMarket(market.conditionId);

      const age = this.getMarketAgeMs(market.conditionId);
      if (age !== null && age > this.cfg.maxMarketAgeMs) continue;

      const volume24h = market.volume24h ?? market.volume;
      if (volume24h > this.cfg.maxVolumeEntry || market.liquidity < this.cfg.minLiquidity) continue;

      try {
        const yesBook = await this.deps.clob.getOrderBook(market.yesTokenId);
        const noBook = await this.deps.clob.getOrderBook(market.noTokenId);
        const yesBa = this.bestBidAsk(yesBook);
        const noBa = this.bestBidAsk(noBook);

        if (yesBa.mid <= 0 || yesBa.mid >= 1 || noBa.mid <= 0 || noBa.mid >= 1) continue;
        if (!isSpreadWide(yesBa.mid, noBa.mid, this.cfg.spreadEntryThreshold)) continue;

        const side: 'yes' | 'no' = yesBa.mid <= noBa.mid ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : market.noTokenId;
        const entryPrice = side === 'yes' ? yesBa.ask : noBa.ask;
        const size = Math.min(this.cfg.maxSnipeUsd, parseFloat(this.cfg.positionSize));

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, size);
        this.lastEntryTime = this.getTime();

        logger.info('Listing arbitrage entry', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          spread: computeSpreadRatio(yesBa.mid, noBa.mid).toFixed(4),
          size: size.toFixed(2),
          question: market.question.slice(0, 80),
        });
      } catch (err) {
        logger.debug('Listing arb scan skip', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  // ── Garbage collect old observed entries ──────────────────────────────────

  pruneObserved(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = this.getTime();
    for (const [id, ts] of this.observedMarkets) {
      if (now - ts > maxAgeMs) this.observedMarkets.delete(id);
    }
  }
}

export function createListingArbitrageSniperTick(
  deps: ListingArbDeps,
): () => Promise<void> {
  const { config, clock, ...baseDeps } = deps;
  const strategy = new ListingArbitrageSniper(baseDeps, config, clock);
  return strategy.toTickFn();
}
