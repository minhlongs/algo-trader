/**
 * Base Polymarket Strategy - Reactive Edition
 * Extracts common patterns shared across strategy implementations:
 * position management, TP/SL exits, cooldowns, event emission, reactive execution.
 *
 * Migration path (per-strategy, incremental):
 * 1. Extend BasePolymarketStrategy instead of hand-rolling factory
 * 2. Override scanEntries() with strategy-specific entry logic
 * 3. Override getExitCondition() for custom exit criteria (optional)
 * 4. Delete hand-rolled position management, exit checks, event emission
 *
 * Existing strategies are NOT modified — this is additive. New strategies
 * should extend this base class. Existing strategies migrate one at a time.
 */

import type { ClobClient, RawOrderBook } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient, GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import { logger } from '../../core/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BaseStrategyConfig {
  /** Minimum market volume (USDC) to consider */
  minVolume: number;
  /** Take-profit as fraction (0.02 = 2%) */
  takeProfitPct: number;
  /** Stop-loss as fraction (0.015 = 1.5%) */
  stopLossPct: number;
  /** Max hold time in ms before forced exit. Wall-clock elapsed since entry, NOT tick count. */
  maxHoldMs: number;
  /** Max concurrent positions */
  maxPositions: number;
  /** Per-market cooldown after exit (ms) */
  cooldownMs: number;
  /** Base trade size in USDC */
  positionSize: string;
}

export interface OpenPosition {
  tokenId: string;
  conditionId: string;
  side: 'yes' | 'no';
  entryPrice: number;
  sizeUsdc: number;
  orderId: string;
  openedAt: number;
}

export interface StrategyDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
}

export interface TradeEvent {
  orderId: string;
  marketId: string;
  side: 'buy' | 'sell';
  fillPrice: string;
  fillSize: string;
  fees: string;
  timestamp: number;
  strategy: StrategyName;
}

/** Context passed to execute() when triggered by a specific price update */
export interface ExecutionContext {
  /** Token ID that triggered this execution (if reactive) */
  triggeringTokenId?: string;
  /** Whether this is a reactive execution (vs scheduled) */
  isReactive?: boolean;
}

// ── Base class ────────────────────────────────────────────────────────────────

export abstract class BasePolymarketStrategy {
  protected readonly positions: OpenPosition[] = [];
  protected readonly cooldowns = new Map<string, number>();

  // Cache for latest prices from reactive updates (avoids re-fetching orderbook)
  private readonly priceCache = new Map<string, { bid: number; ask: number; mid: number; timestamp: number }>();

  constructor(
    protected readonly deps: StrategyDeps,
    protected readonly config: BaseStrategyConfig,
    protected readonly strategyName: StrategyName,
  ) {}

  // ── Abstract methods (strategy-specific) ────────────────────────────────────

  /** Strategy-specific entry scanning. Called each execution after exit checks. */
  protected abstract scanEntries(markets: GammaMarket[]): Promise<void>;

  /**
   * Override to add strategy-specific exit conditions beyond TP/SL/maxHold.
   * @param _pos   — the open position being checked
   * @param _currentPrice — mid price from latest orderbook fetch (or cached price)
   * @param _book   — the full orderbook snapshot (optional, for depth/ratio checks)
   * Return { exit: true, reason: '...' } or { exit: false }.
   * Default: never exit beyond TP/SL/maxHold.
   */
  protected getCustomExitCondition(
    _pos: OpenPosition,
    _currentPrice: number,
    _book?: RawOrderBook,
  ): { exit: boolean; reason: string } {
    return { exit: false, reason: '' };
  }

  // ── Position management ────────────────────────────────────────────────────

  protected hasPosition(conditionId: string): boolean {
    return this.positions.some(p => p.conditionId === conditionId);
  }

  protected getPositionCount(): number {
    return this.positions.length;
  }

  protected isOnCooldown(conditionId: string): boolean {
    const until = this.cooldowns.get(conditionId) ?? 0;
    return Date.now() < until;
  }

  protected setCooldown(conditionId: string): void {
    this.cooldowns.set(conditionId, Date.now() + this.config.cooldownMs);
  }

  // ── Price cache for reactive updates ────────────────────────────────────────

  /**
   * Update cached price for a token from a reactive PRICE_UPDATE event.
   * Called by StrategyRunner when a price update arrives via TradingEventBus.
   * This avoids the strategy needing to re-fetch the orderbook.
   */
  updatePrice(tokenId: string, bid: number, ask: number): void {
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
    this.priceCache.set(tokenId, { bid, ask, mid, timestamp: Date.now() });
  }

  /**
   * Get cached price for a token, or fetch from CLOB if not cached/stale.
   * Stale threshold: 5 seconds.
   */
  protected async getCurrentPrice(tokenId: string): Promise<{ mid: number; bid: number; ask: number; fromCache: boolean }> {
    const cached = this.priceCache.get(tokenId);
    const now = Date.now();

    if (cached && now - cached.timestamp < 5_000) {
      return { mid: cached.mid, bid: cached.bid, ask: cached.ask, fromCache: true };
    }

    // Cache miss or stale - fetch from CLOB
    try {
      const book = await this.deps.clob.getOrderBook(tokenId);
      const { bid, ask, mid } = this.bestBidAsk(book);
      this.priceCache.set(tokenId, { bid, ask, mid, timestamp: now });
      return { mid, bid, ask, fromCache: false };
    } catch {
      // Return cached even if stale rather than failing
      if (cached) {
        return { mid: cached.mid, bid: cached.bid, ask: cached.ask, fromCache: true };
      }
      return { mid: 0, bid: 0, ask: 0, fromCache: false };
    }
  }

  /**
   * Get cached orderbook snapshot for a token, if available.
   * Returns undefined if not cached or stale (>5s).
   */
  protected getCachedOrderbook(tokenId: string): RawOrderBook | undefined {
    const cached = this.priceCache.get(tokenId);
    const now = Date.now();
    if (cached && now - cached.timestamp < 5_000) {
      // Reconstruct minimal orderbook from cached bid/ask
      return {
        bids: cached.bid > 0 ? [{ price: cached.bid.toString(), size: '0' }] : [],
        asks: cached.ask > 0 ? [{ price: cached.ask.toString(), size: '0' }] : [],
        timestamp: cached.timestamp,
      };
    }
    return undefined;
  }

  // ── Price helpers ──────────────────────────────────────────────────────────

  protected bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
    const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    return { bid, ask, mid: (bid + ask) / 2 };
  }

  // ── Entry ──────────────────────────────────────────────────────────────────

  protected async enterPosition(
    tokenId: string,
    conditionId: string,
    side: 'yes' | 'no',
    entryPrice: number,
    sizeUsdc: number,
  ): Promise<void> {
    const order = await this.deps.orderManager.placeOrder({
      tokenId,
      side: 'buy',
      price: entryPrice.toFixed(4),
      size: String(Math.round(sizeUsdc / entryPrice)),
      orderType: 'GTC',
    });

    this.positions.push({
      tokenId,
      conditionId,
      side,
      entryPrice,
      sizeUsdc,
      orderId: order.id,
      openedAt: Date.now(),
    });

    logger.info('Entry position', this.strategyName, {
      conditionId,
      side,
      entryPrice: entryPrice.toFixed(4),
      size: sizeUsdc.toFixed(2),
    });

    this.emitTrade({
      orderId: order.id,
      marketId: conditionId,
      side: 'buy',
      fillPrice: String(entryPrice),
      fillSize: String(sizeUsdc),
      fees: '0',
      timestamp: Date.now(),
      strategy: this.strategyName,
    });
  }

  // ── Exit ────────────────────────────────────────────────────────────────────

  /**
   * Check all open positions for exit conditions (TP/SL/maxHold + custom).
   * Called at the start of every execution.
   * Uses cached prices from reactive updates when available.
   */
  protected async checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      let shouldExit = false;
      let reason = '';

      // Get current price (prefers cached from reactive updates)
      const { mid: currentPrice, fromCache } = await this.getCurrentPrice(pos.tokenId);
      const book = this.getCachedOrderbook(pos.tokenId);

      if (currentPrice === 0) {
        // No price available, skip exit check for this position
        continue;
      }

      // TP/SL calculation
      const gain = pos.side === 'yes'
        ? (currentPrice - pos.entryPrice) / pos.entryPrice
        : (pos.entryPrice - currentPrice) / pos.entryPrice;

      if (gain >= this.config.takeProfitPct) {
        shouldExit = true;
        reason = `take-profit (${(gain * 100).toFixed(2)}%)`;
      } else if (-gain >= this.config.stopLossPct) {
        shouldExit = true;
        reason = `stop-loss (${(gain * 100).toFixed(2)}%)`;
      } else if (now - pos.openedAt > this.config.maxHoldMs) {
        shouldExit = true;
        reason = 'max hold time';
      }

      // Custom exit condition
      if (!shouldExit) {
        const custom = this.getCustomExitCondition(pos, currentPrice, book);
        if (custom.exit) {
          shouldExit = true;
          reason = custom.reason;
        }
      }

      if (shouldExit) {
        await this.exitPosition(pos, currentPrice, reason);
        toRemove.push(i);
      } else if (fromCache) {
        logger.debug('Position check (cached price)', this.strategyName, {
          conditionId: pos.conditionId,
          currentPrice: currentPrice.toFixed(4),
          gain: (gain * 100).toFixed(2) + '%',
        });
      }
    }

    // Remove closed positions in reverse order
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.positions.splice(toRemove[i], 1);
    }
  }

  protected async exitPosition(pos: OpenPosition, currentPrice: number, reason: string): Promise<void> {
    try {
      const exitSide = pos.side === 'yes' ? 'sell' : 'buy';
      await this.deps.orderManager.placeOrder({
        tokenId: pos.tokenId,
        side: exitSide,
        price: currentPrice.toFixed(4),
        size: String(Math.round(pos.sizeUsdc / currentPrice)),
        orderType: 'IOC',
      });

      const pnl = pos.side === 'yes'
        ? (currentPrice - pos.entryPrice) * (pos.sizeUsdc / pos.entryPrice)
        : (pos.entryPrice - currentPrice) * (pos.sizeUsdc / pos.entryPrice);

      logger.info('Exit position', this.strategyName, {
        conditionId: pos.conditionId,
        side: pos.side,
        pnl: pnl.toFixed(4),
        reason,
      });

      this.emitTrade({
        orderId: pos.orderId,
        marketId: pos.conditionId,
        side: exitSide,
        fillPrice: String(currentPrice),
        fillSize: String(pos.sizeUsdc),
        fees: '0',
        timestamp: Date.now(),
        strategy: this.strategyName,
      });

      this.setCooldown(pos.conditionId);
    } catch (err) {
      logger.warn('Exit failed', this.strategyName, { tokenId: pos.tokenId, err: String(err) });
    }
  }

  // ── Event emission ──────────────────────────────────────────────────────────

  protected emitTrade(trade: TradeEvent): void {
    this.deps.eventBus.emit('trade.executed', { trade });
  }

  // ── Execution lifecycle ────────────────────────────────────────────────────

  /**
   * Main execution: check exits, scan trending markets, scan entries.
   * Strategies can override this for different execution logic.
   * Now accepts optional context for reactive executions.
   */
  async execute(context?: ExecutionContext): Promise<void> {
    try {
      await this.checkExits();

      const markets = await this.deps.gamma.getTrending(15);
      await this.scanEntries(markets);

      logger.debug('Execution complete', this.strategyName, {
        openPositions: this.positions.length,
        reactive: context?.isReactive ?? false,
        triggerToken: context?.triggeringTokenId,
      });
    } catch (err) {
      logger.error('Execution failed', this.strategyName, { err: String(err) });
    }
  }

  /**
   * Returns a tick function compatible with the legacy createXxxTick() pattern.
   * Allows gradual migration without changing callers.
   */
  toTickFn(): () => Promise<void> {
    return () => this.execute();
  }
}