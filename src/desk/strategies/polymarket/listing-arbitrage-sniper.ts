/**
 * Listing Arbitrage Sniper — extends BasePolymarketStrategy.
 *
 * Detects newly listed Polymarket markets and enters before liquidity concentrates.
 * Markets with wide spreads (yes + no < 0.98) signal inefficient pricing that
 * converges as liquidity arrives.
 *
 * Entry: first-seen < 30min, vol < $5K, yes+no spread > 2%
 * Exit:  vol > $25K, spread converges to <1%, or 4h timeout
 * Risk:  max 3 concurrent positions, 60min cooldown between entries, max $50/snipe
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type OpenPosition,
  type StrategyDeps,
} from './base-polymarket-strategy';

// ── Config ───────────────────────────────────────────────────────────────────

export interface ListingArbConfig extends BaseStrategyConfig {
  /** yesPrice + noPrice below this = spread > (1 - spreadThreshold) → entry signal */
  spreadEntryThreshold: number;
  /** yesPrice + noPrice above this = spread converged → exit signal */
  spreadConvergenceThreshold: number;
  /** Max market age (ms) since first observation to consider for entry */
  maxMarketAgeMs: number;
  /** Max 24h volume (USDC) for entry — above this = liquidity already arrived */
  maxVolumeEntry: number;
  /** Min 24h volume (USDC) for exit — liquidity arrival signal */
  minVolumeExit: number;
  /** Min market liquidity (USDC) — skip if below */
  minLiquidity: number;
  /** Max USDC per snipe entry */
  maxSnipeUsd: number;
  /** Cooldown between ANY entry (ms), separate from per-market cooldown */
  globalCooldownMs: number;
}

export const DEFAULT_LISTING_ARB_CONFIG: ListingArbConfig = {
  spreadEntryThreshold: 0.98,
  spreadConvergenceThreshold: 0.99,
  maxMarketAgeMs: 30 * 60 * 1000,
  maxVolumeEntry: 5000,
  minVolumeExit: 25_000,
  minLiquidity: 500,
  maxSnipeUsd: 50,
  globalCooldownMs: 60 * 60 * 1000,
  minVolume: 0,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 4 * 60 * 60 * 1000,
  maxPositions: 3,
  cooldownMs: 60 * 60 * 1000,
  positionSize: '50',
};

const STRATEGY_NAME = 'listing-arbitrage-sniper' as StrategyName;

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function computeSpreadRatio(yesPrice: number, noPrice: number): number {
  return yesPrice + noPrice;
}

export function isSpreadWide(yesPrice: number, noPrice: number, threshold: number): boolean {
  return computeSpreadRatio(yesPrice, noPrice) < threshold;
}

export function isSpreadConverged(yesPrice: number, noPrice: number, threshold: number): boolean {
  return computeSpreadRatio(yesPrice, noPrice) > threshold;
}

// ── Strategy class ───────────────────────────────────────────────────────────

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
   * tightens below 1% it signals liquidity has arrived. Uses book spread rather
   * than yes+no spread because getCustomExitCondition receives only one book.
   */
  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (book && book.bids.length > 0 && book.asks.length > 0) {
      const bid = parseFloat(book.bids[0].price);
      const ask = parseFloat(book.asks[0].price);
      // Exit when bid-ask spread has tightened to < 1% of mid (liquidity arrived)
      if (bid > 0 && ask > bid && (ask - bid) / bid < 0.01) {
        return { exit: true, reason: 'spread converged' };
      }
    }
    return { exit: false, reason: '' };
  }

  // ── Entry scanning ────────────────────────────────────────────────────────

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;
    if (this.isGlobalCooldown()) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (market.closed || market.resolved) continue;
      if (!market.yesTokenId || !market.noTokenId) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      // Track first observation time
      this.observeMarket(market.conditionId);

      // Age gate — skip markets we've been watching too long
      const age = this.getMarketAgeMs(market.conditionId);
      if (age !== null && age > this.cfg.maxMarketAgeMs) continue;

      // Volume gate — skip if liquidity already arrived
      const volume24h = market.volume24h ?? market.volume;
      if (volume24h > this.cfg.maxVolumeEntry) continue;

      // Liquidity gate — skip too-thin markets
      if (market.liquidity < this.cfg.minLiquidity) continue;

      try {
        // Fetch orderbooks for both outcomes
        const yesBook = await this.deps.clob.getOrderBook(market.yesTokenId);
        const noBook = await this.deps.clob.getOrderBook(market.noTokenId);

        const yesBa = this.bestBidAsk(yesBook);
        const noBa = this.bestBidAsk(noBook);

        if (yesBa.mid <= 0 || yesBa.mid >= 1 || noBa.mid <= 0 || noBa.mid >= 1) continue;

        // Spread check — entry when yes+no < threshold
        if (!isSpreadWide(yesBa.mid, noBa.mid, this.cfg.spreadEntryThreshold)) continue;

        // Pick side: buy the cheaper outcome (arb toward convergence)
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

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface ListingArbDeps extends StrategyDeps {
  config?: Partial<ListingArbConfig>;
  clock?: () => number;
}

export function createListingArbitrageSniperTick(
  deps: ListingArbDeps,
): () => Promise<void> {
  const { config, clock, ...baseDeps } = deps;
  const strategy = new ListingArbitrageSniper(baseDeps, config, clock);
  return strategy.toTickFn();
}
