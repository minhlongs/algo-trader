/**
 * Whale Tracker strategy for Polymarket binary markets.
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
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';

// ── Config ───────────────────────────────────────────────────────────────────

export interface WhaleTrackerConfig {
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
  /** Take-profit as fraction (0.04 = 4%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.025 = 2.5%) */
  stopLossPct: number;
  /** Max hold time in ms before forced exit */
  maxHoldMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Per-market cooldown after exit (ms) */
  cooldownMs: number;
  /** Trade size in USDC */
  positionSize: string;
}

const DEFAULT_CONFIG: WhaleTrackerConfig = {
  whaleThreshold: 10,
  imbalanceRatio: 3.0,
  minWhaleEvents: 2,
  whaleWindowMs: 60_000,
  minWhaleVolume: 500,
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

interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Calculate median size from a list of orderbook levels.
 * Returns 0 for empty arrays.
 */
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

/**
 * Calculate whale imbalance from a list of whale events.
 * Returns bid/ask volume totals and the ratio (bid / ask).
 */
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

/**
 * Determine entry signal based on whale imbalance and config thresholds.
 */
export function shouldEnter(
  imbalance: { ratio: number; bidVolume: number; askVolume: number },
  config: WhaleTrackerConfig,
): 'buy-yes' | 'buy-no' | null {
  const totalVolume = imbalance.bidVolume + imbalance.askVolume;
  if (totalVolume < config.minWhaleVolume) return null;

  if (imbalance.ratio >= config.imbalanceRatio) {
    return 'buy-yes';
  }

  // Inverse ratio check: ask-heavy
  if (imbalance.ratio > 0 && (1 / imbalance.ratio) >= config.imbalanceRatio) {
    return 'buy-no';
  }

  // Handle ratio === 0 (only ask volume)
  if (imbalance.bidVolume === 0 && imbalance.askVolume >= config.minWhaleVolume) {
    return 'buy-no';
  }

  return null;
}

/** Extract best bid/ask/mid from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface WhaleTrackerDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<WhaleTrackerConfig>;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createWhaleTrackerTick(deps: WhaleTrackerDeps): () => Promise<void> {
  const {
    clob,
    orderManager,
    eventBus,
    gamma,
  } = deps;
  const cfg: WhaleTrackerConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // Per-market state
  const whaleHistory = new Map<string, WhaleEvent[]>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordWhaleEvents(tokenId: string, events: WhaleEvent[]): void {
    let history = whaleHistory.get(tokenId);
    if (!history) {
      history = [];
      whaleHistory.set(tokenId, history);
    }
    history.push(...events);

    // Prune events outside the window
    const cutoff = Date.now() - cfg.whaleWindowMs;
    const firstValid = history.findIndex(e => e.timestamp >= cutoff);
    if (firstValid > 0) {
      history.splice(0, firstValid);
    } else if (firstValid === -1) {
      history.length = 0;
    }
  }

  function getRecentWhaleEvents(tokenId: string): WhaleEvent[] {
    const history = whaleHistory.get(tokenId);
    if (!history) return [];
    const cutoff = Date.now() - cfg.whaleWindowMs;
    return history.filter(e => e.timestamp >= cutoff);
  }

  function isOnCooldown(tokenId: string): boolean {
    const until = cooldowns.get(tokenId) ?? 0;
    return Date.now() < until;
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some(p => p.tokenId === tokenId);
  }

  // ── Exit logic ───────────────────────────────────────────────────────────

  async function checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let shouldExit = false;
      let reason = '';

      // Get current price
      let currentPrice: number;
      let book: RawOrderBook;
      try {
        book = await clob.getOrderBook(pos.tokenId);
        const ba = bestBidAsk(book);
        currentPrice = ba.mid;
      } catch {
        continue; // skip if can't fetch
      }

      // Take profit / Stop loss
      if (pos.side === 'yes') {
        const gain = (currentPrice - pos.entryPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      } else {
        const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
        if (gain >= cfg.takeProfitPct) {
          shouldExit = true;
          reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
        } else if (-gain >= cfg.stopLossPct) {
          shouldExit = true;
          reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
        }
      }

      // Whale reversal exit
      if (!shouldExit) {
        const newWhales = detectWhaleOrders(book!, cfg.whaleThreshold);
        if (newWhales.length > 0) {
          recordWhaleEvents(pos.tokenId, newWhales);
        }
        const recentEvents = getRecentWhaleEvents(pos.tokenId);
        if (recentEvents.length >= cfg.minWhaleEvents) {
          const imbalance = calcWhaleImbalance(recentEvents);
          if (pos.side === 'yes' && imbalance.askVolume > imbalance.bidVolume * cfg.imbalanceRatio) {
            shouldExit = true;
            reason = `whale-reversal (ask dominance ratio=${(imbalance.askVolume / Math.max(imbalance.bidVolume, 0.01)).toFixed(2)})`;
          } else if (pos.side === 'no' && imbalance.bidVolume > imbalance.askVolume * cfg.imbalanceRatio) {
            shouldExit = true;
            reason = `whale-reversal (bid dominance ratio=${(imbalance.bidVolume / Math.max(imbalance.askVolume, 0.01)).toFixed(2)})`;
          }
        }
      }

      // Max hold time
      if (!shouldExit && now - pos.openedAt > cfg.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      if (shouldExit) {
        try {
          const exitSide = pos.side === 'yes' ? 'sell' : 'buy';
          await orderManager.placeOrder({
            tokenId: pos.tokenId,
            side: exitSide,
            price: currentPrice!.toFixed(4),
            size: String(Math.round(pos.sizeUsdc / currentPrice!)),
            orderType: 'IOC',
          });

          const pnl = pos.side === 'yes'
            ? (currentPrice! - pos.entryPrice) * (pos.sizeUsdc / pos.entryPrice)
            : (pos.entryPrice - currentPrice!) * (pos.sizeUsdc / pos.entryPrice);

          logger.info('Exit position', STRATEGY_NAME, {
            conditionId: pos.conditionId,
            side: pos.side,
            pnl: pnl.toFixed(4),
            reason,
          });

          eventBus.emit('trade.executed', {
            trade: {
              orderId: pos.orderId,
              marketId: pos.conditionId,
              side: exitSide,
              fillPrice: String(currentPrice),
              fillSize: String(pos.sizeUsdc),
              fees: '0',
              timestamp: Date.now(),
              strategy: STRATEGY_NAME,
            },
          });

          cooldowns.set(pos.tokenId, now + cfg.cooldownMs);
          toRemove.push(i);
        } catch (err) {
          logger.warn('Exit failed', STRATEGY_NAME, { tokenId: pos.tokenId, err: String(err) });
        }
      }
    }

    // Remove closed positions (reverse order)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      positions.splice(toRemove[i], 1);
    }
  }

  // ── Entry logic ──────────────────────────────────────────────────────────

  async function scanEntries(markets: GammaMarket[]): Promise<void> {
    if (positions.length >= cfg.maxPositions) return;

    for (const market of markets) {
      if (positions.length >= cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (hasPosition(market.yesTokenId)) continue;
      if (market.noTokenId && hasPosition(market.noTokenId)) continue;
      if (isOnCooldown(market.yesTokenId)) continue;

      try {
        // Fetch orderbook for YES token
        const book = await clob.getOrderBook(market.yesTokenId);
        const ba = bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        // Detect whale orders
        const newWhales = detectWhaleOrders(book, cfg.whaleThreshold);
        if (newWhales.length > 0) {
          recordWhaleEvents(market.yesTokenId, newWhales);
        }

        // Get recent whale events
        const recentEvents = getRecentWhaleEvents(market.yesTokenId);
        if (recentEvents.length < cfg.minWhaleEvents) continue;

        // Calculate imbalance
        const imbalance = calcWhaleImbalance(recentEvents);
        const signal = shouldEnter(imbalance, cfg);
        if (!signal) continue;

        // Determine token and price
        const side: 'yes' | 'no' = signal === 'buy-yes' ? 'yes' : 'no';
        const tokenId = side === 'yes' ? market.yesTokenId : (market.noTokenId ?? market.yesTokenId);
        const entryPrice = side === 'yes' ? ba.ask : (1 - ba.bid);
        const posSize = parseFloat(cfg.positionSize);

        const order = await orderManager.placeOrder({
          tokenId,
          side: 'buy',
          price: entryPrice.toFixed(4),
          size: String(Math.round(posSize / entryPrice)),
          orderType: 'GTC',
        });

        positions.push({
          tokenId,
          conditionId: market.conditionId,
          side,
          entryPrice,
          sizeUsdc: posSize,
          orderId: order.id,
          openedAt: Date.now(),
        });

        logger.info('Entry position', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          whaleEvents: recentEvents.length,
          bidVolume: imbalance.bidVolume.toFixed(2),
          askVolume: imbalance.askVolume.toFixed(2),
          ratio: imbalance.ratio.toFixed(2),
          size: posSize,
        });

        eventBus.emit('trade.executed', {
          trade: {
            orderId: order.id,
            marketId: market.conditionId,
            side: 'buy',
            fillPrice: String(entryPrice),
            fillSize: String(posSize),
            fees: '0',
            timestamp: Date.now(),
            strategy: STRATEGY_NAME,
          },
        });
      } catch (err) {
        logger.debug('Scan error', STRATEGY_NAME, {
          market: market.conditionId,
          err: String(err),
        });
      }
    }
  }

  // ── Main tick ────────────────────────────────────────────────────────────

  return async function whaleTrackerTick(): Promise<void> {
    try {
      // 1. Check exits first
      await checkExits();

      // 2. Discover trending markets
      const markets = await gamma.getTrending(15);

      // 3. Scan for entries
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: whaleHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
