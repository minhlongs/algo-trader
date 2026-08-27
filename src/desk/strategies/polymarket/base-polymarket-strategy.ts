/**
 * Base Polymarket Strategy - Reactive Edition
 * Common patterns shared across strategies: position management, TP/SL exits,
 * cooldowns, event emission, reactive execution.
 *
 * Split into focused modules (behavior unchanged, facade re-exports below):
 * - base-polymarket-strategy-types.ts: shared interfaces
 * - base-polymarket-strategy-exits.ts: pure TP/SL/maxHold + pnl math
 * - base-polymarket-strategy-price-cache.ts: reactive price cache (composed)
 * - base-polymarket-strategy-trades.ts: entry/exit execution (composed)
 *
 * Migration: extend this class, override scanEntries() for entry logic and
 * getCustomExitCondition() for custom exits. Existing strategies migrate one at a time.
 */

import type { RawOrderBook } from '../../polymarket/clob-client';
import type { GammaMarket } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';
import type {
  BaseStrategyConfig,
  CustomExitVerdict,
  ExecutionContext,
  OpenPosition,
  StrategyDeps,
  TradeEvent,
} from './base-polymarket-strategy-types';
import { computePositionGain, evaluateExitCondition } from './base-polymarket-strategy-exits';
import { StrategyPriceCache } from './base-polymarket-strategy-price-cache';
import { performEntry, performExit } from './base-polymarket-strategy-trades';
import type { TradeLifecycleContext } from './base-polymarket-strategy-trades';
import { logger } from '../../core/logger';

// Facade re-exports: every existing importer keeps compiling unmodified.
export type { BaseStrategyConfig, OpenPosition, StrategyDeps, TradeEvent, ExecutionContext } from './base-polymarket-strategy-types';

export abstract class BasePolymarketStrategy {
  protected readonly positions: OpenPosition[] = [];
  protected readonly cooldowns = new Map<string, number>();
  private readonly priceCache: StrategyPriceCache;
  private readonly tradeCtx: TradeLifecycleContext;

  constructor(
    protected readonly deps: StrategyDeps,
    protected readonly config: BaseStrategyConfig,
    protected readonly strategyName: StrategyName,
  ) {
    this.priceCache = new StrategyPriceCache(deps.clob);
    this.tradeCtx = {
      deps,
      positions: this.positions,
      strategyName: this.strategyName,
      emitTrade: this.emitTrade.bind(this),
      setCooldown: this.setCooldown.bind(this),
    };
  }

  /** Strategy-specific entry scanning. Called each execution after exit checks. */
  protected abstract scanEntries(markets: GammaMarket[]): Promise<void>;

  /**
   * Override to add strategy-specific exit conditions beyond TP/SL/maxHold.
   * Return { exit: true, reason: '...' } or { exit: false }. Default: never exit.
   */
  protected getCustomExitCondition(
    _pos: OpenPosition,
    _currentPrice: number,
    _book?: RawOrderBook,
  ): CustomExitVerdict {
    return { exit: false, reason: '' };
  }

  protected hasPosition(conditionId: string): boolean {
    return this.positions.some(p => p.conditionId === conditionId);
  }

  protected getPositionCount(): number {
    return this.positions.length;
  }

  protected isOnCooldown(conditionId: string): boolean {
    return Date.now() < (this.cooldowns.get(conditionId) ?? 0);
  }

  protected setCooldown(conditionId: string): void {
    this.cooldowns.set(conditionId, Date.now() + this.config.cooldownMs);
  }

  /** Update cached price from a reactive PRICE_UPDATE event (called by StrategyRunner). */
  updatePrice(tokenId: string, bid: number, ask: number): void {
    this.priceCache.update(tokenId, bid, ask);
  }

  /** Get cached price for a token, or fetch from CLOB if not cached/stale. */
  protected async getCurrentPrice(tokenId: string): Promise<{ mid: number; bid: number; ask: number; fromCache: boolean }> {
    return this.priceCache.getCurrentPrice(tokenId);
  }

  /** Get cached orderbook snapshot for a token (undefined if not cached or stale >5s). */
  protected getCachedOrderbook(tokenId: string): RawOrderBook | undefined {
    return this.priceCache.getCachedOrderbook(tokenId);
  }

  protected bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } {
    return this.priceCache.bestBidAsk(book);
  }

  /** Place a GTC entry order, record the position, log and emit the trade. */
  protected async enterPosition(
    tokenId: string,
    conditionId: string,
    side: 'yes' | 'no',
    entryPrice: number,
    sizeUsdc: number,
  ): Promise<void> {
    await performEntry(this.tradeCtx, tokenId, conditionId, side, entryPrice, sizeUsdc);
  }

  /**
   * Check all open positions for exit conditions (TP/SL/maxHold + custom).
   * Called at the start of every execution. Uses cached prices when available.
   * TP/SL/maxHold math lives in evaluateExitCondition (pure); the custom verdict
   * is resolved HERE via virtual dispatch so subclass overrides keep working.
   */
  protected async checkExits(): Promise<void> {
    const now = Date.now();
    const toRemove: number[] = [];

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const { mid: currentPrice, fromCache } = await this.getCurrentPrice(pos.tokenId);
      const book = this.getCachedOrderbook(pos.tokenId);

      if (currentPrice === 0) continue; // No price available, skip exit check

      // TP/SL/maxHold first (pure math). Custom verdict resolved via virtual
      // dispatch ONLY when none fired — some overrides have side effects, so
      // they must not run on TP/SL exits.
      let { shouldExit, reason } = evaluateExitCondition(pos, currentPrice, this.config, undefined, now);
      if (!shouldExit) {
        const custom = this.getCustomExitCondition(pos, currentPrice, book);
        ({ shouldExit, reason } = evaluateExitCondition(pos, currentPrice, this.config, custom, now));
      }

      if (shouldExit) {
        await this.exitPosition(pos, currentPrice, reason);
        toRemove.push(i);
      } else if (fromCache) {
        const gain = computePositionGain(pos, currentPrice);
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

  /** Place an IOC exit order, log pnl, emit the trade, set cooldown. Swallows errors (logged). */
  protected async exitPosition(pos: OpenPosition, currentPrice: number, reason: string): Promise<void> {
    await performExit(this.tradeCtx, pos, currentPrice, reason);
  }

  protected emitTrade(trade: TradeEvent): void {
    this.deps.eventBus.emit('trade.executed', { trade });
  }

  /**
   * Main execution: check exits, scan trending markets, scan entries.
   * Strategies can override for different logic. Accepts optional reactive context.
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

  /** Returns a tick function compatible with the legacy createXxxTick() pattern. */
  toTickFn(): () => Promise<void> {
    return () => this.execute();
  }
}