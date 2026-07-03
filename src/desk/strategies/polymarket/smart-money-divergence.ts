/**
 * Smart Money Divergence Strategy — V2 implementation.
 *
 * Detects divergence between retail order flow and institutional
 * ("smart money") positioning. Smart money tends to accumulate
 * positions gradually through limit orders, while retail chases
 * price with market orders. When the order book shows large
 * passive orders on one side (smart money) while the price is
 * moving the opposite direction (retail chasing), it signals
 * a divergence worth trading.
 *
 * Entry: order book imbalance diverges from price trend direction
 * Exit: convergence (imbalance and price align) or TP/SL/maxHold
 */

import type { GammaMarket } from '../../polymarket/gamma-client';
import type { RawOrderBook } from '../../polymarket/clob-client';
import type { StrategyName } from '../../core/types';
import type { OpenPosition } from './base-polymarket-strategy';
import { logger } from '../../core/logger';
import {
  BasePolymarketStrategy,
  type BaseStrategyConfig,
  type StrategyDeps,
} from './base-polymarket-strategy';
import { calcOBI } from './strategy-math-helpers';

// ── Config ─────────────────────────────────────────────────────────────────────

export interface SmartMoneyDivergenceConfig extends BaseStrategyConfig {
  /** Price history window for trend detection */
  trendWindow: number;
  /** Minimum |OBI-1| to consider as smart money zone */
  obiThreshold: number;
  /** Only the top N bid/ask levels count as "smart money" depth */
  smartLevels: number;
}

export const DEFAULT_CONFIG: SmartMoneyDivergenceConfig = {
  trendWindow: 5,
  obiThreshold: 1.5,
  smartLevels: 3,
  minVolume: 1000,
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '12',
};

const STRATEGY_NAME: StrategyName = 'smart-money-divergence';

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Compute smart money OBI using only the top N levels of the book. */
export function computeSmartOBI(book: RawOrderBook, levels: number): number {
  const smartBids = book.bids.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  const smartAsks = book.asks.slice(0, levels).reduce((s, l) => s + parseFloat(l.size), 0);
  return calcOBI(smartBids, smartAsks);
}

/** Determine if price trend is up or down. Returns 1 (up), -1 (down), 0 (flat). */
export function getTrendDirection(prices: number[]): number {
  if (prices.length < 3) return 0;
  const recent = prices.slice(-3);
  const up = recent[2]! > recent[0]!;
  const down = recent[2]! < recent[0]!;
  if (up) return 1;
  if (down) return -1;
  return 0;
}

/**
 * Detect divergence: smart money OBI points one way, price trend the other.
 * OBI > 1 + threshold = smart money is buying, OBI < 1 - threshold = selling.
 * Returns 'yes' (smart money buying despite downtrend) or 'no' (smart money selling despite uptrend).
 */
export function detectDivergence(obi: number, trend: number, threshold: number): 'yes' | 'no' | null {
  if (obi > 1 + threshold && trend < 0) return 'yes';  // smart money buying, price dropping
  if (obi < 1 - threshold && trend > 0) return 'no';   // smart money selling, price rising
  return null;
}

// ── Strategy class ─────────────────────────────────────────────────────────────

export class SmartMoneyDivergenceStrategy extends BasePolymarketStrategy {
  private readonly cfg: SmartMoneyDivergenceConfig;
  private readonly priceHistory = new Map<string, number[]>();

  constructor(deps: StrategyDeps, config: Partial<SmartMoneyDivergenceConfig> = {}) {
    const fullConfig: SmartMoneyDivergenceConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Custom exit: divergence converged ──────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book) return { exit: false, reason: '' };

    const obi = computeSmartOBI(book, this.cfg.smartLevels);
    const prices = this.priceHistory.get(pos.tokenId);
    const trend = prices ? getTrendDirection(prices.slice(-this.cfg.trendWindow)) : 0;

    // Exit when divergence converges (OBI and price trend align)
    const divergence = detectDivergence(obi, trend, this.cfg.obiThreshold);
    if (!divergence) {
      return { exit: false, reason: '' };
    }

    // Check if divergence now matches our position direction
    if (pos.side === divergence) {
      // Divergence has persisted rather than converged — hold
      return { exit: false, reason: '' };
    }

    // Divergence has reversed — we're now betting against smart money, exit
    return { exit: true, reason: 'divergence-reversed' };
  }

  // ── Entry scanning ─────────────────────────────────────────────────────

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;
      if ((market.volume ?? 0) < this.cfg.minVolume) continue;

      try {
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // Track price history
        let prices = this.priceHistory.get(market.yesTokenId);
        if (!prices) {
          prices = [];
          this.priceHistory.set(market.yesTokenId, prices);
        }
        prices.push(ba.mid);
        if (prices.length > this.cfg.trendWindow * 5) {
          prices.splice(0, prices.length - this.cfg.trendWindow * 5);
        }

        if (prices.length < this.cfg.trendWindow) continue;

        const obi = computeSmartOBI(book, this.cfg.smartLevels);
        const trend = getTrendDirection(prices.slice(-this.cfg.trendWindow));
        const dir = detectDivergence(obi, trend, this.cfg.obiThreshold);
        if (!dir) continue;

        const tokenId = dir === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = dir === 'yes' ? ba.ask : (1 - ba.bid);
        if (entryPrice <= 0 || entryPrice >= 1) continue;

        await this.enterPosition(
          tokenId,
          market.conditionId,
          dir,
          entryPrice,
          parseFloat(this.cfg.positionSize),
        );

        logger.debug('Smart money entry', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side: dir,
          obi: obi.toFixed(2),
          trend,
          mid: ba.mid.toFixed(4),
        });
      } catch (err) {
        logger.debug('Divergence scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory ─────────────────────────────────────────────────────────────

export function createSmartMoneyDivergenceTick(deps: StrategyDeps): () => Promise<void> {
  const strategy = new SmartMoneyDivergenceStrategy(deps);
  return strategy.toTickFn();
}
