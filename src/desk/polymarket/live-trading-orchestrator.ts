/**
 * Live Trading Orchestrator
 *
 * End-to-end live trading pipeline for Polymarket. Wires:
 *   PolymarketAdapter → LiveOrderManager → LiveExecutionGuard → LivePositionTracker
 *
 * PAPER mode (default): no API keys needed, safe for development.
 * LIVE mode: all orders pass through the guard before hitting the CLOB.
 *
 * Usage:
 *   const orch = new LiveTradingOrchestrator({ paperTrading: false, capitalUsdc: 1000 });
 *   await orch.start();
 *   // ... strategies call orch.placeOrder() ...
 *   await orch.stop();
 */

import { EventEmitter } from 'events';
import { buildPolymarketAdapter, type PolymarketExecutionConfig } from '../execution/polymarket-execution-adapter';
import type { PolymarketAdapter, PolymarketOrderResponse, PolymarketOrderBook } from '../execution/polymarket-adapter';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import { LivePositionTracker, type PositionSummary } from '../execution/live-position-tracker';
import { LiveOrderManager, type OrderState } from '../execution/live-order-manager';
import { LiveExecutionGuard, type GuardStatus } from '../execution/live-execution-guard';
import { LiveTradingJournal, type DailyPnlState } from '../execution/live-trading-journal';
import { setStrategyActive } from '../../platform/middleware/prometheus-metrics';
import { logger } from '../../shared/utils/logger';

// ── Config ────────────────────────────────────────────────────────────────────

export interface LiveTradingConfig extends PolymarketExecutionConfig {
  /** Total capital allocated for live trading (USDC) */
  capitalUsdc: number;
  /** Max position fraction (default: 0.02 = 2%) */
  maxPositionFraction?: number;
  /** Max daily drawdown (default: 0.05 = 5%) */
  maxDailyDrawdown?: number;
  /** Max concurrent positions (default: 10) */
  maxConcurrentPositions?: number;
  /** Max consecutive losses before circuit trip (default: 3) */
  maxConsecutiveLosses?: number;
}

export type OrchestratorStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

// ── Orchestrator ──────────────────────────────────────────────────────────────

export class LiveTradingOrchestrator extends EventEmitter {
  private status: OrchestratorStatus = 'stopped';
  private config: LiveTradingConfig;
  private adapter: PolymarketAdapter | null = null;
  private positionTracker: LivePositionTracker;
  private orderManager: LiveOrderManager | null = null;
  private guard: LiveExecutionGuard;
  private journal: LiveTradingJournal;
  private pricePollInterval: NodeJS.Timeout | null = null;

  constructor(config: LiveTradingConfig) {
    super();
    this.config = {
      capitalUsdc: config.capitalUsdc,
      paperTrading: config.paperTrading ?? true,
      maxPositionFraction: config.maxPositionFraction ?? 0.02,
      maxDailyDrawdown: config.maxDailyDrawdown ?? 0.05,
      maxConcurrentPositions: config.maxConcurrentPositions ?? 10,
      maxConsecutiveLosses: config.maxConsecutiveLosses ?? 3,
    };

    this.positionTracker = new LivePositionTracker(this.config.capitalUsdc);
    this.guard = new LiveExecutionGuard({
      capitalUsdc: this.config.capitalUsdc,
      maxPositionFraction: this.config.maxPositionFraction,
      maxDailyDrawdown: this.config.maxDailyDrawdown,
      maxConcurrentPositions: this.config.maxConcurrentPositions,
      maxConsecutiveLosses: this.config.maxConsecutiveLosses,
      enabled: !this.config.paperTrading,
    });
    this.guard.attachTracker(this.positionTracker);
    this.journal = new LiveTradingJournal();

    // Restore previous state on startup
    this.restoreState();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'starting';

    const mode = this.config.paperTrading ? 'PAPER' : 'LIVE';
    logger.info(`LiveTradingOrchestrator starting in ${mode} mode`, 'Orchestrator', {
      capital: this.config.capitalUsdc,
    });

    try {
      const exec = buildPolymarketAdapter({
        paperTrading: this.config.paperTrading,
        chainId: this.config.chainId,
        apiUrl: this.config.apiUrl,
      });

      if (exec.adapter) {
        this.adapter = exec.adapter;
        this.orderManager = new LiveOrderManager(exec.adapter, this.positionTracker);
        this.guard.setEnabled(true);
        this.startPricePolling();
      }

      this.status = 'running';
      setStrategyActive('live-orchestrator', true);
      this.emit('started', { mode });
      logger.info(`Orchestrator running (${mode})`, 'Orchestrator');
    } catch (err) {
      this.status = 'error';
      logger.error('Orchestrator failed to start', 'Orchestrator', { err: String(err) });
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;
    this.status = 'stopping';
    logger.info('Orchestrator stopping', 'Orchestrator');

    this.stopPricePolling();

    if (this.orderManager) {
      await this.orderManager.stop();
    }

    // Persist state before shutdown
    this.persistState();

    this.status = 'stopped';
    setStrategyActive('live-orchestrator', false);
    this.emit('stopped');
    logger.info('Orchestrator stopped', 'Orchestrator');
  }

  // ── Trading ────────────────────────────────────────────────────────────────

  /** Place an order — guarded in LIVE mode, direct in PAPER mode */
  async placeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    if (this.status !== 'running') {
      throw new Error('Orchestrator not running');
    }

    // Guard check
    const result = this.guard.guardOrder(order);
    if (!result.approved) {
      this.journal.recordEvent('guard_reject', {
        tokenId: order.tokenId.slice(0, 12),
        reason: result.reason,
      });
      logger.warn('Order rejected by guard', 'Orchestrator', {
        reason: result.reason,
        tokenId: order.tokenId.slice(0, 12),
      });
      throw new Error(`Guard rejected: ${result.reason}`);
    }

    // LIVE: place on CLOB via order manager
    if (this.orderManager && this.adapter) {
      return this.orderManager.submitAndTrack(order);
    }

    // PAPER: return simulated response
    logger.debug('Paper order placed', 'Orchestrator', {
      tokenId: order.tokenId.slice(0, 12),
      side: order.side,
      size: order.size,
    });
    return {
      orderID: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'matched',
    };
  }

  /** Cancel a specific order */
  async cancelOrder(orderId: string): Promise<void> {
    if (this.orderManager) {
      await this.orderManager.cancelOrder(orderId);
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getStatus(): OrchestratorStatus {
    return this.status;
  }

  getMode(): 'PAPER' | 'LIVE' {
    return this.config.paperTrading ? 'PAPER' : 'LIVE';
  }

  getPositions() {
    return this.positionTracker.getPositions();
  }

  getPositionSummary(): PositionSummary {
    return this.positionTracker.getSummary();
  }

  getGuardStatus(): GuardStatus {
    return this.guard.getStatus();
  }

  getActiveOrders(): OrderState[] {
    return this.orderManager?.getActiveOrders() ?? [];
  }

  getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    if (!this.adapter) {
      throw new Error('Orderbook only available in LIVE mode');
    }
    return this.adapter.getOrderBook(tokenId);
  }

  // ── Private: price polling ─────────────────────────────────────────────────

  private startPricePolling(): void {
    if (this.pricePollInterval) return;
    this.pricePollInterval = setInterval(() => this.updatePrices(), 30_000);
    this.pricePollInterval.unref(); // don't keep process alive
  }

  private stopPricePolling(): void {
    if (this.pricePollInterval) {
      clearInterval(this.pricePollInterval);
      this.pricePollInterval = null;
    }
  }

  private async updatePrices(): Promise<void> {
    if (!this.adapter) return;
    const positions = this.positionTracker.getPositions();
    if (positions.length === 0) return;

    const prices = new Map<string, { bid: number; ask: number }>();

    await Promise.allSettled(
      positions.map(async (pos) => {
        try {
          const book = await this.adapter!.getOrderBook(pos.tokenId);
          const bestBid = book.bids[0] ? parseFloat(book.bids[0].price) : 0;
          const bestAsk = book.asks[0] ? parseFloat(book.asks[0].price) : 0;
          if (bestBid > 0 || bestAsk > 0) {
            prices.set(pos.tokenId, { bid: bestBid, ask: bestAsk });
          }
        } catch {
          // skip failed price fetch — keep last known price
        }
      }),
    );

    if (prices.size > 0) {
      this.positionTracker.updatePrices(prices);
      this.persistState();
    }
  }

  // ── Private: persistence ──────────────────────────────────────────────────

  private persistState(): void {
    try {
      // Save positions
      const positions = this.positionTracker.getPositions();
      this.journal.savePositions(positions);

      // Save daily P&L
      const summary = this.positionTracker.getSummary();
      const guard = this.guard.getStatus();
      const pnlState: DailyPnlState = {
        date: this.journal.getToday(),
        realizedPnl: summary.totalRealizedPnl,
        tradeCount: guard.totalWins + guard.totalLosses,
        winCount: guard.totalWins,
        lossCount: guard.totalLosses,
      };
      this.journal.saveDailyPnl(pnlState);

      // Check for circuit trip changes
      if (guard.circuitTripped) {
        this.journal.recordEvent('circuit_trip', {
          consecutiveLosses: guard.consecutiveLosses,
          dailyPnl: guard.dailyPnl,
        });
      }
    } catch (err) {
      logger.error('Failed to persist state', 'Orchestrator', { err: String(err) });
    }
  }

  private restoreState(): void {
    try {
      // Check day rollover
      const rolled = this.journal.checkDayRollover();
      if (rolled) {
        logger.info('New trading day — resetting daily P&L', 'Orchestrator', { prevDay: rolled });
        this.guard.resetDaily();
        this.journal.recordEvent('daily_reset', { prevDay: rolled });
      }

      // Restore daily P&L if same day
      const savedPnl = this.journal.loadDailyPnl();
      if (savedPnl) {
        logger.info('Restored daily P&L', 'Orchestrator', savedPnl);
      }

      logger.info('State restored', 'Orchestrator', {
        positionsLoaded: this.journal.loadPositions().length,
        fillCount: this.journal.getLifetimeStats().totalFills,
        today: this.journal.getToday(),
      });
    } catch (err) {
      logger.warn('Failed to restore state — starting fresh', 'Orchestrator', { err: String(err) });
    }
  }

  /** Get the journal for external consumers (CLI, dashboard) */
  getJournal(): LiveTradingJournal {
    return this.journal;
  }
}
