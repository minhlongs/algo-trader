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
import { StrategyPriceCache } from './base-polymarket-strategy-price-cache';
import { performEntry, performExit } from './base-polymarket-strategy-trades';
import type { TradeLifecycleContext } from './base-polymarket-strategy-trades';
import { processPositionExits, type ExitCheckContext } from './base-polymarket-strategy-exit-runner';
import { logger } from '../../core/logger';

export type { BaseStrategyConfig, OpenPosition, StrategyDeps, TradeEvent, ExecutionContext } from './base-polymarket-strategy-types';
export { processPositionExits };
export type { ExitCheckContext };

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

  /** Override to add strategy-specific exit conditions beyond TP/SL/maxHold. */
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

  protected getPositionCount(): number { return this.positions.length; }

  protected isOnCooldown(conditionId: string, now = Date.now()): boolean {
    return now < (this.cooldowns.get(conditionId) ?? 0);
  }

  protected setCooldown(conditionId: string, now = Date.now()): void {
    this.cooldowns.set(conditionId, now + this.config.cooldownMs);
  }

  /** Update cached price from a reactive PRICE_UPDATE event (called by StrategyRunner). */
  updatePrice(tokenId: string, bid: number, ask: number): void { this.priceCache.update(tokenId, bid, ask); }

  /** Get cached price for a token, or fetch from CLOB if not cached/stale. */
  protected async getCurrentPrice(tokenId: string): Promise<{ mid: number; bid: number; ask: number; fromCache: boolean }> {
    return this.priceCache.getCurrentPrice(tokenId);
  }

  /** Get cached orderbook snapshot for a token (undefined if not cached or stale >5s). */
  protected getCachedOrderbook(tokenId: string): RawOrderBook | undefined { return this.priceCache.getCachedOrderbook(tokenId); }

  protected bestBidAsk(book: RawOrderBook): { bid: number; ask: number; mid: number } { return this.priceCache.bestBidAsk(book); }

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

  /** Check all open positions for exit conditions (TP/SL/maxHold + custom). */
  protected async checkExits(now = Date.now()): Promise<void> {
    const ctx: ExitCheckContext = {
      positions: this.positions,
      config: this.config,
      strategyName: this.strategyName,
      getCurrentPrice: this.getCurrentPrice.bind(this),
      getCachedOrderbook: this.getCachedOrderbook.bind(this),
      getCustomExitCondition: this.getCustomExitCondition.bind(this),
      exitPosition: this.exitPosition.bind(this),
    };
    await processPositionExits(ctx, now);
  }

  /** Place an IOC exit order, log pnl, emit the trade, set cooldown. Swallows errors (logged). */
  protected async exitPosition(pos: OpenPosition, currentPrice: number, reason: string): Promise<void> {
    await performExit(this.tradeCtx, pos, currentPrice, reason);
  }

  protected emitTrade(trade: TradeEvent): void {
    this.deps.eventBus.emit('trade.executed', { trade });
  }

  /** Main execution: check exits, scan trending markets, scan entries. */
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
