import { logger } from '../core/logger';
import { savePaperTradeV3 } from '../wiring/paper-trading-persistence';
import type { PaperTrade } from '../wiring/paper-trading-orchestrator';
import type { TradingPipeline } from '../trading-pipeline';
export type KVStore = {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
};

// Cast from the worker's typed KVNamespace binding (compatible runtime shape).
function asKVStore(kv: unknown): KVStore | undefined {
  return kv as KVStore | undefined;
}
import {
  basePriceForSymbol,
  simulatePriceTick,
  nextId,
  closePaperTrade,
  calculateOrderSize,
} from './trade-executor';

/** KV key for paper trading loop state. */
const STATE_KEY = 'paper-trading-loop-state';

// ── Public interfaces ────────────────────────────────────────────────────────

export interface PaperTradingConfig {
  readonly symbols: string[];
  readonly timeframe: string;
  readonly intervalMs: number;
  readonly maxConcurrentTrades: number;
  readonly holdDurationMs?: number;
}

export interface PaperTradeRecord {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  sizeUsd: number;
  entryPrice: number;
  exitPrice?: number;
  pnlUsd?: number;
  openedAt: number;
  closedAt?: number;
  isPaper?: boolean;
  durationMs?: number;
}

export interface PaperTradingStatus {
  isRunning: boolean;
  running: boolean;
  openTrades: number;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlUsd: number;
  startTime?: number;
}

// ── PaperTradingLoop ─────────────────────────────────────────────────────────

/**
 * Automated paper trading loop.
 *
 * Rotates through configured symbols, simulates trade entries and exits,
 * and optionally persists closed trades to the database.
 */
export class PaperTradingLoop {
  private readonly config: PaperTradingConfig;
  private readonly pipeline?: TradingPipeline;
  private kv?: KVStore;
  private readonly trades: PaperTradeRecord[] = [];
  private handle: ReturnType<typeof setInterval> | undefined;
  private startTime: number | undefined;
  private tradeCounter = 0;

  constructor(config: PaperTradingConfig, pipeline?: TradingPipeline, kv?: KVStore) {
    this.config = config;
    this.pipeline = pipeline;
    this.kv = kv;
  }

  /** Set KV store after construction (used by the scheduled handler). */
  setKV(kv: unknown): void {
    this.kv = asKVStore(kv);
  }

  /**
   * Load state from KV before running a tick (CF Workers are stateless).
   */
  async loadState(): Promise<void> {
    if (!this.kv) return;
    try {
      const raw = await this.kv.get(STATE_KEY, 'json');
      if (raw && typeof raw === 'object') {
        const state = raw as { trades?: PaperTradeRecord[]; tradeCounter?: number; startTime?: number };
        // Replace — not append.  Without clearing, every cron invocation
        // re-pushes the same saved trades, producing duplicates.
        this.trades.length = 0;
        if (Array.isArray(state.trades)) this.trades.push(...state.trades);
        // Use max(saved, length) so the counter never produces duplicate IDs
        // even if saved trades outlast a stale counter.
        if (typeof state.tradeCounter === 'number') {
          this.tradeCounter = Math.max(state.tradeCounter, this.trades.length);
        }
        if (typeof state.startTime === 'number') this.startTime = state.startTime;
      }
    } catch (err) {
      logger.warn('[PaperTradingLoop] State load failed', { err });
    }
  }

  /**
   * Persist state to KV after a tick.
   *
   * Returns the put() promise so callers can await it before the handler
   * returns. CF Workers are stateless — an un-awaited KV put is cancelled at
   * the invocation boundary, so fire-and-forget persistence silently drops
   * state across cron ticks.
   */
  private saveState(): Promise<void> {
    if (!this.kv) {
      console.log('[PaperTradingLoop] saveState skipped: no KV');
      return Promise.resolve();
    }
    const payload = JSON.stringify({
      trades: this.trades,
      tradeCounter: this.tradeCounter,
      startTime: this.startTime,
    });
    console.log(`[PaperTradingLoop] saveState writing ${payload.length} bytes, trades=${this.trades.length}, counter=${this.tradeCounter}`);
    return this.kv.put(STATE_KEY, payload).then(() => {
      console.log('[PaperTradingLoop] saveState KV put succeeded');
    }).catch((err) => {
      console.error('[PaperTradingLoop] saveState KV put FAILED', err);
    });
  }

  start(): void {
    if (this.handle) return; // already running
    this.startTime = Date.now();
    this.handle = setInterval(() => this.tick(), this.config.intervalMs);
    logger.info('[PaperTradingLoop] Started', {
      symbols: this.config.symbols,
      intervalMs: this.config.intervalMs,
    });
  }

  /**
   * Execute a single tick (stateless-friendly).
   * CF Workers are stateless per invocation — cron triggers hit `scheduled`,
   * so the loop must run one tick per invocation rather than via setInterval.
   * Call loadState() before and saveState() after each tick.
   *
   * Returns the saveState promise so the caller can await it before the
   * handler returns — otherwise the fire-and-forget KV put is cancelled by
   * the stateless worker's invocation boundary.
   */
  async runTick(): Promise<void> {
    console.log(`[PaperTradingLoop] runTick start: hasKV=${!!this.kv}, trades=${this.trades.length}`);
    await this.tick();
    console.log(`[PaperTradingLoop] runTick after tick: trades=${this.trades.length}, hasKV=${!!this.kv}`);
    if (this.kv) {
      await this.saveState();
    } else {
      console.log('[PaperTradingLoop] runTick: no KV, skipping save');
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

      // ── Close matured trades ──
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
            // Await — CF Workers are stateless; a fire-and-forget D1 write is
            // cancelled at the invocation boundary and the trade is lost.
            await this.persistClosedTrade(closed);
          }
        }
      }

      // ── Open new trades up to max ──
      const openCount = this.trades.filter((t) => t.exitPrice === undefined).length;
      if (openCount < this.config.maxConcurrentTrades) {
        const symbol = this.randomSymbol();
        const basePrice = basePriceForSymbol(symbol);
        const entryPrice = simulatePriceTick(basePrice);
        const sizeUsd = calculateOrderSize(
          this.pipeline,
          this.config.maxConcurrentTrades,
        );

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

      // State persistence handled by runTick() after tick() returns.
    } catch (err) {
      logger.error('[PaperTradingLoop] tick failed', { err });
      this.stop();
    }
  }

  /** Persist closed trade to paper_trades_v3 table. */
  private async persistClosedTrade(closed: PaperTradeRecord): Promise<void> {
    const v3Trade: PaperTrade = {
      id: closed.id,
      marketId: closed.symbol,
      side: closed.side === 'BUY' ? 'YES' : 'NO',
      size: closed.sizeUsd,
      entryPrice: closed.entryPrice,
      strategy: 'paper-loop',
      source: 'paper-loop',
      signalConfidence: 0.5,
      swarmApproved: false,
      aiValidated: false,
      timestamp: closed.openedAt,
    };
    await savePaperTradeV3(v3Trade);
  }

  getState(): PaperTradingStatus {
    const totalPnl = this.totalPnl();
    return {
      isRunning: this.handle !== undefined,
      running: this.handle !== undefined,
      openTrades: this.trades.filter((t) => t.exitPrice === undefined).length,
      totalTrades: this.trades.length,
      winRate: this.winRate(),
      totalPnl,
      totalPnlUsd: totalPnl,
      startTime: this.startTime,
    };
  }

  /** Return a shallow copy of all trade records. */
  getTrades(): PaperTradeRecord[] {
    return [...this.trades];
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private randomSymbol(): string {
    const { symbols } = this.config;
    return symbols[Math.floor(Math.random() * symbols.length)];
  }

  private winRate(): number {
    const closed = this.trades.filter((t) => t.exitPrice !== undefined);
    if (closed.length === 0) return 0;
    return closed.filter((t) => (t.pnlUsd ?? 0) > 0).length / closed.length;
  }

  private totalPnl(): number {
    return this.trades.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0);
  }
}
