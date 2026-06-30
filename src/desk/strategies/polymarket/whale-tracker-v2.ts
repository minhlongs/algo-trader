/**
 * Whale Tracker V2 — extends BasePolymarketStrategy.
 *
 * Detects abnormally large orders in the orderbook that indicate whale
 * activity. When a whale places a large bid/ask, smaller traders often
 * follow. Trades in the direction of whale activity.
 *
 * Signal logic:
 *   1. For each level, check if size > medianSize * whaleThreshold
 *   2. Track whale events: timestamp, side, price, size
 *   3. Entry: whale bid volume > whale ask volume by imbalanceRatio → BUY YES
 *            Opposite → BUY NO
 *   4. Require minWhaleEvents within whaleWindowMs to confirm pattern
 *   5. Total whale volume > minWhaleVolume (USDC)
 *
 * Custom exit: whale reversal (ask dominance when long YES, bid dominance when long NO).
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

// ── Config (extends base with strategy-specific fields) ────────────────────────

export interface WhaleTrackerConfig extends BaseStrategyConfig {
  /** Multiplier of median size to qualify as whale order */
  whaleThreshold: number;
  /** Whale bid/ask volume ratio to trigger signal */
  imbalanceRatio: number;
  /** Minimum whale events in window to confirm pattern */
  minWhaleEvents: number;
  /** Whale detection window in ms */
  whaleWindowMs: number;
  /** Minimum total whale volume in USDC */
  minWhaleVolume: number;
}

export const DEFAULT_CONFIG: WhaleTrackerConfig = {
  whaleThreshold: 10,
  imbalanceRatio: 3.0,
  minWhaleEvents: 2,
  whaleWindowMs: 60_000,
  minWhaleVolume: 500,
  minVolume: 0, // whale tracker doesn't filter by market volume
  takeProfitPct: 0.04,
  stopLossPct: 0.025,
  maxHoldMs: 10 * 60_000,
  maxPositions: 3,
  cooldownMs: 120_000,
  positionSize: '15',
};

const STRATEGY_NAME: StrategyName = 'whale-tracker';

// ── Internal types ───────────────────────────────────────────────────────────

export interface WhaleEvent {
  timestamp: number;
  side: 'bid' | 'ask';
  price: number;
  size: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** Calculate median size from a list of orderbook levels. Returns 0 for empty arrays. */
export function calcMedianSize(levels: { size: string }[]): number {
  if (levels.length === 0) return 0;
  const sizes = levels.map(l => parseFloat(l.size)).sort((a, b) => a - b);
  const mid = Math.floor(sizes.length / 2);
  if (sizes.length % 2 === 0) {
    return (sizes[mid - 1] + sizes[mid]) / 2;
  }
  return sizes[mid];
}

/**
 * Detect whale orders from an orderbook.
 * A level qualifies as a whale order if its size > median * threshold.
 */
export function detectWhaleOrders(
  book: { bids: { price: string; size: string }[]; asks: { price: string; size: string }[] },
  threshold: number,
): WhaleEvent[] {
  const allLevels = [...book.bids, ...book.asks];
  const median = calcMedianSize(allLevels);
  if (median === 0) return [];

  const cutoff = median * threshold;
  const now = Date.now();
  const events: WhaleEvent[] = [];

  for (const level of book.bids) {
    const size = parseFloat(level.size);
    if (size > cutoff) {
      events.push({ timestamp: now, side: 'bid', price: parseFloat(level.price), size });
    }
  }

  for (const level of book.asks) {
    const size = parseFloat(level.size);
    if (size > cutoff) {
      events.push({ timestamp: now, side: 'ask', price: parseFloat(level.price), size });
    }
  }

  return events;
}

/** Calculate whale imbalance from a list of whale events. */
export function calcWhaleImbalance(events: WhaleEvent[]): { bidVolume: number; askVolume: number; ratio: number } {
  let bidVolume = 0;
  let askVolume = 0;

  for (const e of events) {
    if (e.side === 'bid') bidVolume += e.size;
    else askVolume += e.size;
  }

  const ratio = askVolume === 0
    ? (bidVolume > 0 ? Infinity : 0)
    : bidVolume / askVolume;

  return { bidVolume, askVolume, ratio };
}

/** Determine entry signal based on whale imbalance and config thresholds. */
export function shouldEnter(
  imbalance: { ratio: number; bidVolume: number; askVolume: number },
  config: WhaleTrackerConfig,
): 'buy-yes' | 'buy-no' | null {
  const totalVolume = imbalance.bidVolume + imbalance.askVolume;
  if (totalVolume < config.minWhaleVolume) return null;

  if (imbalance.ratio >= config.imbalanceRatio) return 'buy-yes';

  // Inverse ratio check: ask-heavy
  if (imbalance.ratio > 0 && (1 / imbalance.ratio) >= config.imbalanceRatio) return 'buy-no';

  // Handle ratio === 0 (only ask volume)
  if (imbalance.bidVolume === 0 && imbalance.askVolume >= config.minWhaleVolume) return 'buy-no';

  return null;
}

// ── Strategy class ───────────────────────────────────────────────────────────

export class WhaleTrackerStrategy extends BasePolymarketStrategy {
  private readonly cfg: WhaleTrackerConfig;

  // Per-market whale event history
  private readonly whaleHistory = new Map<string, WhaleEvent[]>();

  constructor(deps: StrategyDeps, config: Partial<WhaleTrackerConfig> = {}) {
    const fullConfig: WhaleTrackerConfig = { ...DEFAULT_CONFIG, ...config };
    super(deps, fullConfig, STRATEGY_NAME);
    this.cfg = fullConfig;
  }

  // ── Whale event state management ──────────────────────────────────────────

  private recordWhaleEvents(tokenId: string, events: WhaleEvent[]): void {
    let history = this.whaleHistory.get(tokenId);
    if (!history) {
      history = [];
      this.whaleHistory.set(tokenId, history);
    }
    history.push(...events);

    // Prune events outside the window
    const cutoff = Date.now() - this.cfg.whaleWindowMs;
    const firstValid = history.findIndex(e => e.timestamp >= cutoff);
    if (firstValid > 0) {
      history.splice(0, firstValid);
    } else if (firstValid === -1) {
      history.length = 0;
    }
  }

  private getRecentWhaleEvents(tokenId: string): WhaleEvent[] {
    const history = this.whaleHistory.get(tokenId);
    if (!history) return [];
    const cutoff = Date.now() - this.cfg.whaleWindowMs;
    return history.filter(e => e.timestamp >= cutoff);
  }

  // ── Custom exit: whale reversal ───────────────────────────────────────────

  protected getCustomExitCondition(
    pos: OpenPosition,
    _currentPrice: number,
    book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    if (!book) return { exit: false, reason: '' };

    // Detect and record new whale events from latest orderbook
    const newWhales = detectWhaleOrders(book, this.cfg.whaleThreshold);
    if (newWhales.length > 0) {
      this.recordWhaleEvents(pos.tokenId, newWhales);
    }

    const recentEvents = this.getRecentWhaleEvents(pos.tokenId);
    if (recentEvents.length < this.cfg.minWhaleEvents) {
      return { exit: false, reason: '' };
    }

    const imbalance = calcWhaleImbalance(recentEvents);

    if (pos.side === 'yes' && imbalance.askVolume > imbalance.bidVolume * this.cfg.imbalanceRatio) {
      return {
        exit: true,
        reason: `whale-reversal (ask dominance ratio=${(imbalance.askVolume / Math.max(imbalance.bidVolume, 0.01)).toFixed(2)})`,
      };
    }
    if (pos.side === 'no' && imbalance.bidVolume > imbalance.askVolume * this.cfg.imbalanceRatio) {
      return {
        exit: true,
        reason: `whale-reversal (bid dominance ratio=${(imbalance.bidVolume / Math.max(imbalance.askVolume, 0.01)).toFixed(2)})`,
      };
    }

    return { exit: false, reason: '' };
  }

  // ── Entry logic ──────────────────────────────────────────────────────────

  protected async scanEntries(markets: GammaMarket[]): Promise<void> {
    if (this.getPositionCount() >= this.cfg.maxPositions) return;

    for (const market of markets) {
      if (this.getPositionCount() >= this.cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (this.hasPosition(market.conditionId)) continue;
      if (this.isOnCooldown(market.conditionId)) continue;

      try {
        // Fetch orderbook for YES token to detect whales
        const book = await this.deps.clob.getOrderBook(market.yesTokenId);
        const ba = this.bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // Detect whale orders
        const newWhales = detectWhaleOrders(book, this.cfg.whaleThreshold);
        if (newWhales.length > 0) {
          this.recordWhaleEvents(market.yesTokenId, newWhales);
        }

        // Get recent whale events
        const recentEvents = this.getRecentWhaleEvents(market.yesTokenId);
        if (recentEvents.length < this.cfg.minWhaleEvents) continue;

        // Calculate imbalance
        const imbalance = calcWhaleImbalance(recentEvents);
        const signal = shouldEnter(imbalance, this.cfg);
        if (!signal) continue;

        // Determine token and price
        const side: 'yes' | 'no' = signal === 'buy-yes' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        const posSize = parseFloat(this.cfg.positionSize);

        await this.enterPosition(tokenId, market.conditionId, side, entryPrice, posSize);

        logger.info('Entry position', this.strategyName, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          whaleEvents: recentEvents.length,
          bidVolume: imbalance.bidVolume.toFixed(2),
          askVolume: imbalance.askVolume.toFixed(2),
          ratio: imbalance.ratio.toFixed(2),
          size: posSize,
        });
      } catch (err) {
        logger.debug('Scan error', this.strategyName, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }
}

// ── Legacy factory (backward compat) ─────────────────────────────────────────

export interface WhaleTrackerDeps extends StrategyDeps {
  config?: Partial<WhaleTrackerConfig>;
}

export function createWhaleTrackerTick(deps: WhaleTrackerDeps): () => Promise<void> {
  const { config, ...baseDeps } = deps;
  const strategy = new WhaleTrackerStrategy(baseDeps, config);
  return strategy.toTickFn();
}
