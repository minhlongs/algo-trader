/**
 * Base Polymarket Strategy
 * Extracts common patterns shared across 32 strategy implementations:
 * position management, TP/SL exits, cooldowns, event emission, tick lifecycle.
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
import type { RiskGateManager } from '../../risk/risk-gate-manager';
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
  /** Polymarket CLOB client for orderbook and price data */
  clob: ClobClient;
  /** Order manager for placing and tracking orders */
  orderManager: OrderManager;
  /** Event bus for trade and signal events */
  eventBus: EventBus;
  /** Gamma API client for market discovery */
  gamma: GammaClient;
  /** Optional risk gate manager for pre-order risk checks */
  riskManager?: RiskGateManager;
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

// ── Base class ────────────────────────────────────────────────────────────────

export abstract class BasePolymarketStrategy {
  protected readonly positions: OpenPosition[] = [];
  protected readonly cooldowns = new Map<string, number>();

  constructor(
    protected readonly deps: StrategyDeps,
    protected readonly config: BaseStrategyConfig,
    protected readonly strategyName: StrategyName,
  ) {}

  // ── Abstract methods (strategy-specific) ──────────────────────────────────

  /** Strategy-specific entry scanning. Called each tick after exit checks. */
  protected abstract scanEntries(markets: GammaMarket[]): Promise<void>;

  /**
   * Override to add strategy-specific exit conditions beyond TP/SL/maxHold.
   * @param _pos   — the open position being checked
   * @param _currentPrice — mid price from latest orderbook fetch
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

  // ── Position management ───────────────────────────────────────────────────

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

  // ── Price helpers ─────────────────────────────────────────────────────────

  protected bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
    const bid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const ask = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    return { bid, ask, mid: (bid + ask) / 2 };
  }

  // ── Entry ─────────────────────────────────────────────────────────────────

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

  // ── Exit ──────────────────────────────────────────────────────────────────

  /**
   * Check all open positions for exit conditions (TP/SL/maxHold + custom).
   * Called at the start of every tick.
   */
  protected async checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      let shouldExit = false;
      let reason = '';

      // Get current mid price and orderbook
      let currentPrice: number;
      let book: RawOrderBook | undefined;
      try {
        book = await this.deps.clob.getOrderBook(pos.tokenId);
        currentPrice = this.bestBidAsk(book).mid;
      } catch {
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

  // ── Event emission ────────────────────────────────────────────────────────

  protected emitTrade(trade: TradeEvent): void {
    this.deps.eventBus.emit('trade.executed', { trade });
  }

  // ── Tick lifecycle ────────────────────────────────────────────────────────

  /**
   * Main tick: scan trending markets, check exits, scan entries.
   * Strategies can override this for different tick logic.
   */
  async execute(): Promise<void> {
    try {
      await this.checkExits();

      const markets = await this.deps.gamma.getTrending(15);
      await this.scanEntries(markets);

      logger.debug('Tick complete', this.strategyName, {
        openPositions: this.positions.length,
      });
    } catch (err) {
      logger.error('Tick failed', this.strategyName, { err: String(err) });
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
