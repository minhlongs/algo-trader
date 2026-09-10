import { logger } from '../core/logger';
import type { TradingPipeline } from '../trading-pipeline';
import {
  basePriceForSymbol,
  simulatePriceTick,
  nextId,
  closePaperTrade,
  calculateOrderSize,
} from './trade-executor';
import {
  type D1Database,
  type D1PreparedStatement,
  type D1Result,
  type KVStore,
  asKVStore,
  type PaperTradingConfig,
  type PaperTradeRecord,
  type PaperTradingStatus,
} from './paper-trading-types';
import {
  loadLoopState,
  saveLoopState,
  persistClosedTradeToD1,
} from './paper-trading-persistence';
import { buildLoopStatus } from './paper-trading-metrics';

// Re-export public types and interfaces for backward compatibility
export type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  KVStore,
  PaperTradingConfig,
  PaperTradeRecord,
  PaperTradingStatus,
} from './paper-trading-types';
export { asKVStore } from './paper-trading-types';

/**
 * Automated paper trading loop.
 * Rotates through configured symbols, simulates trade entries and exits,
 * and optionally persists closed trades to the database.
 */
export class PaperTradingLoop {
  private readonly config: PaperTradingConfig;
  private readonly pipeline?: TradingPipeline;
  private kv?: KVStore;
  private db?: D1Database;
  private readonly trades: PaperTradeRecord[] = [];
  private handle: ReturnType<typeof setInterval> | undefined;
  private startTime: number | undefined;
  private tradeCounter = 0;

  constructor(
    config: PaperTradingConfig,
    pipeline?: TradingPipeline,
    kv?: KVStore,
    db?: D1Database,
  ) {
    this.config = config;
    this.pipeline = pipeline;
    this.kv = kv;
    this.db = db;
  }

  setKV(kv: unknown): void {
    this.kv = asKVStore(kv);
  }

  setDB(db: unknown): void {
    this.db = db as D1Database | undefined;
  }

  async loadState(): Promise<void> {
    const loaded = await loadLoopState(this.kv, this.trades);
    if (loaded) {
      if (typeof loaded.tradeCounter === 'number') {
        this.tradeCounter = loaded.tradeCounter;
      }
      if (typeof loaded.startTime === 'number') {
        this.startTime = loaded.startTime;
      }
    }
  }

  private saveState(): Promise<void> {
    return saveLoopState(this.kv, this.trades, this.tradeCounter, this.startTime);
  }

  start(): void {
    if (this.handle) return;
    this.startTime = Date.now();
    this.handle = setInterval(() => this.tick(), this.config.intervalMs);
    logger.info('[PaperTradingLoop] Started', {
      symbols: this.config.symbols,
      intervalMs: this.config.intervalMs,
    });
  }

  async runTick(): Promise<void> {
    logger.debug(`[PaperTradingLoop] runTick start: hasKV=${!!this.kv}, trades=${this.trades.length}`);
    await this.tick();
    logger.debug(`[PaperTradingLoop] runTick after tick: trades=${this.trades.length}, hasKV=${!!this.kv}`);
    if (this.kv) {
      await this.saveState();
    } else {
      logger.debug('[PaperTradingLoop] runTick: no KV, skipping save');
    }
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
    logger.info('[PaperTradingLoop] Stopped', { trades: this.trades.length });
  }

  private async tick(): Promise<void> {
    try {
      const now = Date.now();
      const holdDuration = this.config.holdDurationMs ?? 60_000;

      // Close matured trades
      for (const trade of this.trades) {
        if (trade.exitPrice !== undefined) continue;
        if (now - trade.openedAt >= holdDuration) {
          const closed = closePaperTrade(this.trades, holdDuration);
          if (closed) {
            logger.info('[PaperTradingLoop] Trade closed', {
              id: closed.id,
              symbol: closed.symbol,
              pnl: closed.pnlUsd?.toFixed(2),
            });
            await this.persistClosedTrade(closed);
          }
        }
      }

      // Persist any closed trades loaded from KV that were never written to D1
      for (const trade of this.trades) {
        if (trade.exitPrice !== undefined && trade.id && !trade.persistedToDb) {
          await this.persistClosedTrade(trade);
          trade.persistedToDb = true;
        }
      }

      // Open new trades up to max
      const openCount = this.trades.filter((t) => t.exitPrice === undefined).length;
      if (openCount < this.config.maxConcurrentTrades) {
        const symbol = this.randomSymbol();
        const basePrice = basePriceForSymbol(symbol);
        const entryPrice = simulatePriceTick(basePrice);
        const sizeUsd = calculateOrderSize(this.pipeline, this.config.maxConcurrentTrades);

        const trade: PaperTradeRecord = {
          id: nextId(++this.tradeCounter),
          symbol,
          side: Math.random() < 0.5 ? 'BUY' : 'SELL',
          sizeUsd,
          entryPrice,
          openedAt: now,
          isPaper: true,
          durationMs: 0,
        };
        this.trades.push(trade);
        logger.debug('[PaperTradingLoop] Trade opened', {
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side,
          size: sizeUsd,
        });
      }
    } catch (err) {
      logger.error('[PaperTradingLoop] tick failed', { err });
      this.stop();
    }
  }

  private async persistClosedTrade(closed: PaperTradeRecord): Promise<void> {
    await persistClosedTradeToD1(this.db, closed);
  }

  getState(): PaperTradingStatus {
    return buildLoopStatus(this.handle !== undefined, this.trades, this.startTime);
  }

  getTrades(): PaperTradeRecord[] {
    return [...this.trades];
  }

  private randomSymbol(): string {
    const { symbols } = this.config;
    return symbols[Math.floor(Math.random() * symbols.length)];
  }
}
