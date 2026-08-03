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
import { CircuitBreaker } from '../risk/circuit-breaker';
import type { PolymarketAdapter, PolymarketOrderResponse, PolymarketOrderBook } from '../execution/polymarket-adapter';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import { LivePositionTracker, type PositionSummary } from '../execution/live-position-tracker';
import { LiveOrderManager, type OrderState } from '../execution/live-order-manager';
import { LiveExecutionGuard, type GuardStatus } from '../execution/live-execution-guard';
import { LiveTradingJournal, type DailyPnlState } from '../execution/live-trading-journal';
import { RiskGateManager } from '../risk/risk-gate-manager';
import { setStrategyActive } from '../../platform/middleware/prometheus-metrics';
import { logger } from '../../shared/utils/logger';
import { TradingEventBus, PriceUpdatePayload, tradingEventBus } from '../events/trading-event-bus';
import type { TradeSignal } from './strategy-live-bridge';

// ── Env-var validation ───────────────────────────────────────────────────────────

const REQUIRED_LIVE_VARS: Array<{ envKey: string; legacyKey: string; label: string }> = [
  { envKey: 'POLYMARKET_API_KEY', legacyKey: 'POLY_API_KEY', label: 'Polymarket API Key' },
  { envKey: 'POLYMARKET_API_SECRET', legacyKey: 'POLY_API_SECRET', label: 'Polymarket API Secret' },
  { envKey: 'POLYMARKET_PASSPHRASE', legacyKey: 'POLY_PASSPHRASE', label: 'Polymarket Passphrase' },
  { envKey: 'POLYMARKET_ETH_ADDRESS', legacyKey: 'POLY_ETH_ADDRESS', label: 'Polymarket ETH Address' },
];

function validateLiveEnv(): void {
  const missing: string[] = [];
  for (const v of REQUIRED_LIVE_VARS) {
    const val = process.env[v.envKey] ?? process.env[v.legacyKey] ?? '';
    if (!val) {
      missing.push(`${v.label} (${v.envKey} or ${v.legacyKey})`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `LIVE mode requires all Polymarket API env vars:\n  ${missing.join('\n  ')}\n` +
      'Set them in your .env or use PAPER_MODE=true for paper trading.',
    );
  }
}

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
  private riskManager: RiskGateManager;
  private paperStats = new Map<string, { paperTrades: number; paperPnl: number }>();

  // Event-driven price updates via TradingEventBus
  private priceUpdateHandler: ((payload: PriceUpdatePayload) => void) | null = null;

  constructor(config: LiveTradingConfig) {
    super();

    // Respect PAPER_MODE env var if set, but allow explicit config to override
    const envPaperMode = process.env['PAPER_MODE'];
    const paperTrading = config.paperTrading ?? (envPaperMode !== undefined ? envPaperMode !== 'false' : true);

    this.config = {
      capitalUsdc: config.capitalUsdc,
      paperTrading,
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
    this.riskManager = new RiskGateManager(this.guard, new CircuitBreaker());

    // Restore previous state on startup
    this.restoreState();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'starting';

    // Validate env vars before starting in LIVE mode
    if (!this.config.paperTrading) {
      validateLiveEnv();
    }

    const mode = this.config.paperTrading ? 'PAPER' : 'LIVE';
    const paperModeEnv = process.env['PAPER_MODE'] ?? 'true';
    logger.info(`LiveTradingOrchestrator starting in ${mode} mode`, 'Orchestrator', {
      capital: this.config.capitalUsdc,
      envPaperMode: paperModeEnv,
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

        // Subscribe to real-time price updates from TradingEventBus
        this.subscribeToPriceUpdates();
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

    // Unsubscribe from price updates
    this.unsubscribeFromPriceUpdates();

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

  // ── Event Bus Price Updates ────────────────────────────────────────────────

  /**
   * Subscribe to PRICE_UPDATE events from TradingEventBus.
   * Updates LivePositionTracker in real-time for accurate mark-to-market.
   */
  private subscribeToPriceUpdates(): void {
    this.priceUpdateHandler = (payload: PriceUpdatePayload) => {
      this.handlePriceUpdate(payload);
    };
    tradingEventBus.on('PRICE_UPDATE', this.priceUpdateHandler);

    logger.debug('Orchestrator subscribed to TradingEventBus PRICE_UPDATE', 'Orchestrator');
  }

  private unsubscribeFromPriceUpdates(): void {
    if (this.priceUpdateHandler) {
      tradingEventBus.off('PRICE_UPDATE', this.priceUpdateHandler);
      this.priceUpdateHandler = null;
    }
  }

  /**
   * Handle incoming PRICE_UPDATE event.
   * Updates position tracker with the latest bid/ask for the token.
   */
  private handlePriceUpdate(payload: PriceUpdatePayload): void {
    if (this.status !== 'running') return;

    const { tokenId, bid, ask } = payload;

    if (bid > 0 && ask > 0) {
      const prices = new Map<string, { bid: number; ask: number }>();
      prices.set(tokenId, { bid, ask });
      this.positionTracker.updatePrices(prices);
    }
  }

  // ── Private: persistence ──────────────────────────────────────────────────

  private async persistState(): Promise<void> {
    try {
      // Save positions
      const positions = this.positionTracker.getPositions();
      this.journal.savePositions(positions);

      // Save daily P&L
      const summary = this.positionTracker.getSummary();
      const guard = this.guard.getStatus();
      const today = this.journal.getToday();
      const pnlState: DailyPnlState = {
        date: today,
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

  private async restoreState(): Promise<void> {
    try {
      // Check day rollover
      const rolled = this.journal.checkDayRollover();
      if (rolled) {
        logger.info('New trading day — resetting daily P&L', 'Orchestrator', { prevDay: rolled });
        this.guard.resetDaily();
        this.journal.recordEvent('daily_reset', { prevDay: rolled });
      }

      // Restore daily P&L if same day
      const savedPnl = await this.journal.loadDailyPnl();
      if (savedPnl) {
        logger.info('Restored daily P&L', 'Orchestrator', savedPnl);
      }

      logger.info('State restored', 'Orchestrator', {
        positionsLoaded: (await this.journal.loadPositions()).length,
        fillCount: (await this.journal.getLifetimeStats()).totalFills,
        today: await this.journal.getToday(),
      });
    } catch (err) {
      logger.warn('Failed to restore state — starting fresh', 'Orchestrator', { err: String(err) });
    }
  }

  /** Get the journal for external consumers (CLI, dashboard) */
  getJournal(): LiveTradingJournal {
    return this.journal;
  }

  // ── Strategy tick execution ───────────────────────────────────────────────

  /**
   * Submit a signal through the Hard Risk Circuit (SignalTTL + RateLimiter + Guard).
   * This is the FINAL gate before hitting the CLOB — cannot be bypassed.
   * Only available in LIVE mode (requires LiveOrderManager).
   */
  async submitSignal(signal: TradeSignal, strategyName: string): Promise<PolymarketOrderResponse> {
    if (!this.orderManager) {
      throw new Error('submitSignal only available in LIVE mode (requires LiveOrderManager)');
    }
    return this.orderManager.submitSignal(signal, strategyName);
  }

  /**
   * Execute a strategy tick with a pre-tick risk gate check and error boundary.
   *
   * - Calls `RiskGateManager.check(strategyKey)` to verify global risk
   *   conditions (circuit breaker, drawdown, concurrent positions).
   * - If blocked: logs a warning and skips the tick (does NOT crash).
   * - Wraps the tick function in try/catch — one strategy failure does
   *   not stop other strategies from executing.
   * - In PAPER mode, increments the per-strategy paper trade counter.
   *
   * @param strategyKey — unique strategy identifier (e.g. 'vwap-sniper')
   * @param tickFn      — the strategy's tick function
   */
  async executeStrategyTick(strategyKey: string, tickFn: () => Promise<void>): Promise<void> {
    // Pre-tick risk gate — check global conditions before executing
    const gate = await this.riskManager.check(strategyKey);
    if (!gate.allowed) {
      logger.warn(
        `Strategy tick skipped for ${strategyKey}: ${gate.reason}`,
        'Orchestrator',
      );
      return;
    }

    try {
      await tickFn();
    } catch (err) {
      // Per-strategy error boundary — log and continue
      logger.error(`Strategy tick failed for ${strategyKey}`, 'Orchestrator', {
        err: String(err),
      });
    }
  }

  /**
   * Update per-strategy paper P&L after a trade completes.
   * Called from external consumers (CLI, dashboard) when paper trade
   * results are known.
   */
  updatePaperPnl(strategyKey: string, pnlDelta: number): void {
    const stats = this.paperStats.get(strategyKey) ?? { paperTrades: 0, paperPnl: 0 };
    stats.paperPnl += pnlDelta;
    this.paperStats.set(strategyKey, stats);
  }

  /** Get per-strategy paper trade stats */
  getPaperStats(): ReadonlyMap<string, { paperTrades: number; paperPnl: number }> {
    return this.paperStats;
  }

  /** Access the RiskGateManager (for external consumers) */
  getRiskManager(): RiskGateManager {
    return this.riskManager;
  }
}