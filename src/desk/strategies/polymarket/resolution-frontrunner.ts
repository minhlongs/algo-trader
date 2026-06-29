/**
 * Resolution Frontrunner strategy for Polymarket binary markets.
 *
 * Markets approaching their end/resolution date tend to converge toward their
 * final outcome. If a market is within `resolutionWindowMs` of its endDate and
 * price is strongly directional (>highThreshold or <lowThreshold), trade in the
 * convergence direction expecting price to approach 1.0 or 0.0.
 *
 * Signal logic:
 *   1. Filter markets where endDate is within resolutionWindowMs (default 24h)
 *   2. Price > highThreshold (0.85) → likely resolves YES → BUY YES
 *      Price < lowThreshold (0.15) → likely resolves NO  → BUY NO
 *   3. Momentum confirmation: price moved in convergence direction over last N ticks
 *   4. Volume confirmation: volume24h > minVolume24h
 */
import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';

// ── Config ───────────────────────────────────────────────────────────────────

export interface ResolutionFrontrunnerConfig {
  /** Time window before endDate to consider market near resolution (ms) */
  resolutionWindowMs: number;
  /** Price above this → likely resolves YES */
  highThreshold: number;
  /** Price below this → likely resolves NO */
  lowThreshold: number;
  /** Number of recent ticks needed for momentum confirmation */
  momentumTicks: number;
  /** Minimum 24h volume to consider a market */
  minVolume24h: number;
  /** Take-profit as fraction (0.03 = 3%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.05 = 5%) */
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

const DEFAULT_CONFIG: ResolutionFrontrunnerConfig = {
  resolutionWindowMs: 86_400_000,  // 24h
  highThreshold: 0.85,
  lowThreshold: 0.15,
  momentumTicks: 5,
  minVolume24h: 10_000,
  takeProfitPct: 0.03,
  stopLossPct: 0.05,
  maxHoldMs: 14_400_000,  // 4h
  maxPositions: 3,
  cooldownMs: 300_000,     // 5min
  positionSize: '20',
};

const STRATEGY_NAME: StrategyName = 'resolution-frontrunner';

// ── Internal types ───────────────────────────────────────────────────────────

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

/** Check if a market's endDate is within the resolution window from now. */
export function isNearResolution(endDate: string, windowMs: number, now: number = Date.now()): boolean {
  const end = new Date(endDate).getTime();
  if (isNaN(end)) return false;
  const diff = end - now;
  // Must be in the future (or just past) and within the window
  return diff > 0 && diff <= windowMs;
}

/** Detect convergence signal based on current price. */
export function detectConvergenceSignal(
  price: number,
  config: Pick<ResolutionFrontrunnerConfig, 'highThreshold' | 'lowThreshold'>,
): 'buy-yes' | 'buy-no' | null {
  if (price > config.highThreshold) return 'buy-yes';
  if (price < config.lowThreshold) return 'buy-no';
  return null;
}

/** Check if price history shows momentum in the given direction. */
export function hasMomentum(priceHistory: number[], direction: 'up' | 'down', minTicks: number): boolean {
  if (priceHistory.length < minTicks) return false;

  const recent = priceHistory.slice(-minTicks);
  // Count how many consecutive ticks moved in the right direction
  let consistentMoves = 0;
  for (let i = 1; i < recent.length; i++) {
    if (direction === 'up' && recent[i] >= recent[i - 1]) {
      consistentMoves++;
    } else if (direction === 'down' && recent[i] <= recent[i - 1]) {
      consistentMoves++;
    }
  }

  // Require majority of moves to be in the expected direction
  return consistentMoves >= Math.ceil((minTicks - 1) * 0.6);
}

/** Extract mid price from raw order book. */
function bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
  const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
  const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
  return { bid, ask, mid: (bid + ask) / 2 };
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface ResolutionFrontrunnerDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<ResolutionFrontrunnerConfig>;
  /** Injectable clock for testing (defaults to () => Date.now()) */
  clock?: () => number;
}

// ── Tick factory ─────────────────────────────────────────────────────────────

export function createResolutionFrontrunnerTick(deps: ResolutionFrontrunnerDeps): () => Promise<void> {
  const { clob, orderManager, eventBus, gamma } = deps;
  const cfg: ResolutionFrontrunnerConfig = { ...DEFAULT_CONFIG, ...deps.config };
  const clock = deps.clock ?? (() => Date.now());

  // Per-market state
  const priceHistory = new Map<string, number[]>();
  const positions: OpenPosition[] = [];
  const cooldowns = new Map<string, number>();

  // ── Helpers ──────────────────────────────────────────────────────────────

  function recordPrice(tokenId: string, price: number): void {
    let history = priceHistory.get(tokenId);
    if (!history) {
      history = [];
      priceHistory.set(tokenId, history);
    }
    history.push(price);
    // Keep at most momentumTicks * 3 entries
    const maxLen = cfg.momentumTicks * 3;
    if (history.length > maxLen) {
      history.splice(0, history.length - maxLen);
    }
  }

  function getPriceWindow(tokenId: string): number[] {
    return priceHistory.get(tokenId) ?? [];
  }

  function isOnCooldown(tokenId: string): boolean {
    const until = cooldowns.get(tokenId) ?? 0;
    return clock() < until;
  }

  function hasPosition(tokenId: string): boolean {
    return positions.some(p => p.tokenId === tokenId);
  }

  // ── Exit logic ───────────────────────────────────────────────────────────

  async function checkExits(markets: GammaMarket[]): Promise<void> {
    const now = clock();
    const toRemove: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      let shouldExit = false;
      let reason = '';

      // Check if market resolved
      const market = markets.find(m => m.conditionId === pos.conditionId);
      if (market?.resolved) {
        shouldExit = true;
        reason = 'market resolved';
      }

      // Get current price
      let currentPrice: number;
      try {
        const book = await clob.getOrderBook(pos.tokenId);
        const ba = bestBidAsk(book);
        currentPrice = ba.mid;
        recordPrice(pos.tokenId, currentPrice);
      } catch {
        continue; // skip if can't fetch
      }

      // Take profit / Stop loss
      if (!shouldExit) {
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
          // NO positions: profit when price goes down
          const gain = (pos.entryPrice - currentPrice) / pos.entryPrice;
          if (gain >= cfg.takeProfitPct) {
            shouldExit = true;
            reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
          } else if (-gain >= cfg.stopLossPct) {
            shouldExit = true;
            reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
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
              fillPrice: String(currentPrice!),
              fillSize: String(pos.sizeUsdc),
              fees: '0',
              timestamp: clock(),
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
    const now = clock();

    for (const market of markets) {
      if (positions.length >= cfg.maxPositions) break;
      if (!market.yesTokenId || market.closed || market.resolved) continue;
      if (hasPosition(market.yesTokenId)) continue;
      if (market.noTokenId && hasPosition(market.noTokenId)) continue;
      if (isOnCooldown(market.yesTokenId)) continue;

      // Volume check — volume24h may be absent on older markets, treat as 0
      if ((market.volume24h ?? 0) < cfg.minVolume24h) continue;

      // Resolution window check
      if (!isNearResolution(market.endDate, cfg.resolutionWindowMs, now)) continue;

      try {
        const book = await clob.getOrderBook(market.yesTokenId);
        const ba = bestBidAsk(book);
        if (ba.mid <= 0 || ba.mid >= 1) continue;

        recordPrice(market.yesTokenId, ba.mid);

        // Convergence signal
        const signal = detectConvergenceSignal(ba.mid, cfg);
        if (!signal) continue;

        // Momentum confirmation
        const history = getPriceWindow(market.yesTokenId);
        const direction = signal === 'buy-yes' ? 'up' : 'down';
        if (!hasMomentum(history, direction, cfg.momentumTicks)) continue;

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
          openedAt: now,
        });

        logger.info('Entry position', STRATEGY_NAME, {
          conditionId: market.conditionId,
          side,
          entryPrice: entryPrice.toFixed(4),
          signal,
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
            timestamp: now,
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

  // ── Main tick ──────────────────────────────────────────────────────────

  return async function resolutionFrontrunnerTick(): Promise<void> {
    try {
      // 1. Discover markets
      const markets = await gamma.getTrending(50);

      // 2. Check exits (pass markets for resolution detection)
      await checkExits(markets);

      // 3. Scan for entries
      await scanEntries(markets);

      logger.debug('Tick complete', STRATEGY_NAME, {
        openPositions: positions.length,
        trackedMarkets: priceHistory.size,
      });
    } catch (err) {
      logger.error('Tick failed', STRATEGY_NAME, { err: String(err) });
    }
  };
}
