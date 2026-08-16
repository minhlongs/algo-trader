/**
 * Paper Trading Loop — Automated strategy validation via simulated trades.
 *
 * Runs on a configurable interval, picks symbols from the configured list,
 * simulates BUY/SELL entries at current-like prices, then closes after a
 * configurable hold period. Trades are tracked in memory; no persistence.
 *
 * Use this to validate strategy signals before promoting to live deployment.
 */

import { logger } from '../core/logger';
import type { TradingPipeline } from '../trading-pipeline';

// ── Public interfaces ────────────────────────────────────────────────────────

/** Configuration for the paper trading loop. */
export interface PaperTradingConfig {
  /** Symbols to rotate through (e.g. ["BTC/USD", "ETH/USD"]). */
  readonly symbols: string[];
  /** Candle timeframe (e.g. "1m", "5m", "1h"). */
  readonly timeframe: string;
  /** Loop interval in milliseconds. */
  readonly intervalMs: number;
  /** Maximum open trades allowed at once. */
  readonly maxConcurrentTrades: number;
  /** Hold duration in ms before auto-closing a paper trade (default 60 000). */
  readonly holdDurationMs?: number;
}

/** A single paper trade record — tracked in memory only. */
export interface PaperTradeRecord {
  readonly id: string;
  readonly strategyId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly sizeUsd: number;
  readonly entryPrice: number;
  exitPrice?: number;
  pnlUsd?: number;
  readonly timestamp: number;
  durationMs?: number;
  readonly isPaper: true;
}

/** Current state snapshot of the paper trading loop. */
export interface PaperTradingState {
  isRunning: boolean;
  totalTrades: number;
  winRate: number;
  totalPnlUsd: number;
  startTime?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _idSeq = 0;

function nextId(): string {
  _idSeq += 1;
  return `paper-${Date.now()}-${_idSeq}`;
}

/** Simple random walk to simulate a realistic price movement. */
function simulatePriceTick(basePrice: number, volatilityPct: number): number {
  const jitter = (Math.random() - 0.5) * 2 * volatilityPct;
  return Math.max(0.01, basePrice * (1 + jitter));
}

/** Derive a base price for the symbol from a deterministic seed. */
function basePriceForSymbol(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = ((hash << 5) - hash + symbol.charCodeAt(i)) | 0;
  }
  // Map to a reasonable crypto-ish price range $50 — $80 000
  return Math.abs(hash % 79950) + 50;
}

// ── PaperTradingLoop ─────────────────────────────────────────────────────────

/**
 * Automated paper trading loop.
 *
 * Rotates through configured symbols, simulates trade entries and exits,
 * and tracks cumulative PnL and win rate in memory.
 */
export class PaperTradingLoop {
  private readonly config: PaperTradingConfig;
  private readonly pipeline: TradingPipeline;

  private readonly trades: PaperTradeRecord[] = [];
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private startTime: number | undefined;

  /** Strategy ID counter for labeling simulated strategy. */
  private strategyIdSeq = 0;

  constructor(config: PaperTradingConfig, pipeline: TradingPipeline) {
    this.config = config;
    this.pipeline = pipeline;
  }

  /**
   * Begin the paper trading loop.
   *
   * Starts a setInterval that fires every `config.intervalMs`. Each tick:
   * 1. Closes any trades whose hold duration has elapsed.
   * 2. If under max concurrent limit, opens a new paper trade.
   */
  start(): void {
    if (this.intervalHandle !== null) {
      logger.warn('[PaperTradingLoop] Already running — ignoring start()', 'PaperTradingLoop');
      return;
    }

    this.startTime = Date.now();
    this.intervalHandle = setInterval(() => this.tick(), this.config.intervalMs);
    logger.info(
      `[PaperTradingLoop] Started — interval=${this.config.intervalMs}ms symbols=${this.config.symbols.length}`,
      'PaperTradingLoop',
    );
  }

  /** Halt the paper trading loop. Does not close open trades. */
  stop(): void {
    if (this.intervalHandle === null) {
      logger.warn('[PaperTradingLoop] Not running — ignoring stop()', 'PaperTradingLoop');
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    logger.info(
      `[PaperTradingLoop] Stopped — totalTrades=${this.trades.length} pnl=${this.totalPnl().toFixed(2)} USD`,
      'PaperTradingLoop',
    );
  }

  /**
   * Return a snapshot of the current loop state.
   */
  getState(): PaperTradingState {
    return {
      isRunning: this.intervalHandle !== null,
      totalTrades: this.trades.length,
      winRate: this.winRate(),
      totalPnlUsd: this.totalPnl(),
      startTime: this.startTime,
    };
  }

  /** Return a shallow copy of all trade records. */
  getTrades(): PaperTradeRecord[] {
    return [...this.trades];
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private tick(): void {
    const now = Date.now();
    const holdDuration = this.config.holdDurationMs ?? 60_000;

    // 1) Close matured trades
    for (const trade of this.trades) {
      if (trade.exitPrice !== undefined) continue; // already closed
      if (now - trade.timestamp < holdDuration) continue;

      const basePrice = basePriceForSymbol(trade.symbol);
      const volatilityPct = 0.002; // 0.2% random walk
      const exitPrice = simulatePriceTick(basePrice, volatilityPct);

      trade.exitPrice = exitPrice;
      trade.durationMs = now - trade.timestamp;

      if (trade.side === 'BUY') {
        trade.pnlUsd = (exitPrice - trade.entryPrice) * (trade.sizeUsd / trade.entryPrice);
      } else {
        trade.pnlUsd = (trade.entryPrice - exitPrice) * (trade.sizeUsd / trade.entryPrice);
      }

      logger.info(
        `[PaperTradingLoop] Closed ${trade.side} ${trade.symbol} pnl=$${trade.pnlUsd.toFixed(2)} duration=${trade.durationMs}ms`,
        'PaperTradingLoop',
      );
    }

    // 2) Open new trade if under limit
    const openCount = this.trades.filter((t) => t.exitPrice === undefined).length;
    if (openCount >= this.config.maxConcurrentTrades) return;

    const symbol = this.pickSymbol();
    const basePrice = basePriceForSymbol(symbol);
    const entryPrice = simulatePriceTick(basePrice, 0.001); // 0.1% noise at entry
    const side: 'BUY' | 'SELL' = Math.random() < 0.5 ? 'BUY' : 'SELL';
    const sizeUsd = this.estimateSizeUsd();

    const strategyId = `paper-strategy-${(this.strategyIdSeq += 1)}`;

    const record: PaperTradeRecord = {
      id: nextId(),
      strategyId,
      symbol,
      side,
      sizeUsd,
      entryPrice,
      timestamp: now,
      isPaper: true,
    };

    this.trades.push(record);

    logger.info(
      `[PaperTradingLoop] Opened ${side} ${symbol} $${sizeUsd.toFixed(2)} @ ${entryPrice.toFixed(2)}`,
      'PaperTradingLoop',
    );
  }

  private pickSymbol(): string {
    const { symbols } = this.config;
    return symbols[Math.floor(Math.random() * symbols.length)];
  }

  /** Conservative sizing: fraction of current wallet balance, capped. */
  private estimateSizeUsd(): number {
    try {
      const wallet = this.pipeline.wallet.getWallet(this.pipeline.walletLabel);
      const balance = wallet?.currentBalance ?? 100;
      const fraction = Math.min(0.05, 1 / Math.max(this.config.maxConcurrentTrades, 1));
      return Math.min(balance * fraction, 1000);
    } catch {
      return 100;
    }
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
