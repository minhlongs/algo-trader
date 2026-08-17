/** Paper trading loop — simulated trades via trade-executor.ts. */

import { logger } from '../core/logger';
import { savePaperTradeV3 } from '../wiring/paper-trading-persistence';
import type { PaperTrade } from '../wiring/paper-trading-orchestrator';
import type { TradingPipeline } from '../trading-pipeline';
import {
  basePriceForSymbol,
  simulatePriceTick,
  nextId,
  closePaperTrade,
  calculateOrderSize,
} from './trade-executor';

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
  private readonly trades: PaperTradeRecord[] = [];
  private handle: ReturnType<typeof setInterval> | undefined;
  private startTime: number | undefined;
  private tradeCounter = 0;

  constructor(config: PaperTradingConfig, pipeline?: TradingPipeline) {
    this.config = config;
    this.pipeline = pipeline;
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

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
    logger.info('[PaperTradingLoop] Stopped', { trades: this.trades.length });
  }

  private tick(): void {
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
            this.persistClosedTrade(closed).catch((err) => {
              logger.warn('[PaperTradingLoop] Persist failed', { err });
            });
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
