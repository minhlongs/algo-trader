/**
 * Live Trading Orchestrator
 *
 * End-to-end live trading pipeline for Polymarket. Wires:
 *   PolymarketAdapter -> LiveOrderManager -> LiveExecutionGuard -> LivePositionTracker
 */

import { EventEmitter } from 'events';
import type { PolymarketAdapter, PolymarketOrderResponse, PolymarketOrderBook } from '../execution/polymarket-adapter';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import { LivePositionTracker, type PositionSummary } from '../execution/live-position-tracker';
import { LiveOrderManager, type OrderState } from '../execution/live-order-manager';
import type { LiveExecutionGuard, GuardStatus } from '../execution/live-execution-guard';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import type { RiskGateManager } from '../risk/risk-gate-manager';
import { setStrategyActive } from '../../platform/middleware/prometheus-metrics';
import { logger } from '../../shared/utils/logger';
import type { TradeSignal } from './strategy-live-bridge';
import { LiveTradingStrategyExecutor } from './live-trading-strategy-executor';
import type { OrchestratorStatus, LiveTradingConfig } from './live-trading-types';
import { normalizeConfig, buildCoreComponents, buildStartComponents } from './live-trading-adapter-setup';
import { persistOrchestratorState, restoreOrchestratorState } from './live-trading-state-persistence';
import { LiveTradingEventSubscriber } from './live-trading-event-subscriber';

// Backward-compat re-exports
export type { OrchestratorStatus, LiveTradingConfig } from './live-trading-types';
export {
  validateLiveEnv,
  LiveTradingStrategyExecutor,
  LiveTradingEventHandler,
  LiveTradingPersistence,
  buildCoreComponents as buildOrchestratorComponents,
  buildStartComponents as buildAdapter,
  persistOrchestratorState,
  restoreOrchestratorState,
} from './live-trading-public';

export class LiveTradingOrchestrator extends EventEmitter {
  private status: OrchestratorStatus = 'stopped';
  private config: LiveTradingConfig;
  private adapter: PolymarketAdapter | null = null;
  private positionTracker: LivePositionTracker;
  private orderManager: LiveOrderManager | null = null;
  private guard: LiveExecutionGuard;
  private journal: LiveTradingJournal;
  private riskManager: RiskGateManager;
  private strategyExecutor: LiveTradingStrategyExecutor;
  private eventSubscriber: LiveTradingEventSubscriber;

  constructor(rawConfig: LiveTradingConfig) {
    super();
    this.config = normalizeConfig(rawConfig);
    const c = buildCoreComponents(this.config);
    this.adapter = c.adapter;
    this.positionTracker = c.positionTracker;
    this.orderManager = c.orderManager;
    this.guard = c.guard;
    this.journal = c.journal;
    this.riskManager = c.riskManager;
    this.strategyExecutor = c.strategyExecutor;
    this.eventSubscriber = new LiveTradingEventSubscriber(() => this.status, this.positionTracker);
    this.restoreState();
  }

  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'starting';
    const mode = this.config.paperTrading ? 'PAPER' : 'LIVE';
    logger.info(`Orchestrator starting in ${mode} mode`, 'Orchestrator', { capital: this.config.capitalUsdc });
    try {
      const c = buildCoreComponents(this.config);
      this.positionTracker = c.positionTracker;
      this.guard = c.guard;
      this.guard.attachTracker(this.positionTracker);
      buildStartComponents(this.config, c);
      this.adapter = c.adapter;
      this.orderManager = c.orderManager;
      this.eventSubscriber = new LiveTradingEventSubscriber(() => this.status, this.positionTracker);
      this.eventSubscriber.subscribe();
      this.status = 'running';
      setStrategyActive('live-orchestrator', true);
      this.emit('started', { mode });
    } catch (err) {
      this.status = 'error';
      logger.error('Orchestrator failed to start', 'Orchestrator', { err: String(err) });
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.status === 'stopped') return;
    this.status = 'stopping';
    this.unsubscribeFromPriceUpdates();
    if (this.orderManager) await this.orderManager.stop();
    await this.persistState();
    this.status = 'stopped';
    setStrategyActive('live-orchestrator', false);
    this.emit('stopped');
  }

  async placeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    if (this.status !== 'running') throw new Error('Orchestrator not running');
    const result = this.guard.guardOrder(order);
    if (!result.approved) {
      this.journal.recordEvent('guard_reject', { tokenId: order.tokenId.slice(0, 12), reason: result.reason });
      throw new Error(`Guard rejected: ${result.reason}`);
    }
    if (this.orderManager) return this.orderManager.submitAndTrack(order);
    return { orderID: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: 'matched' };
  }

  async cancelOrder(orderId: string): Promise<void> {
    if (this.orderManager) await this.orderManager.cancelOrder(orderId);
  }

  getStatus(): OrchestratorStatus { return this.status; }
  getMode(): 'PAPER' | 'LIVE' { return this.config.paperTrading ? 'PAPER' : 'LIVE'; }
  getPositions() { return this.positionTracker.getPositions(); }
  getPositionSummary(): PositionSummary { return this.positionTracker.getSummary(); }
  getGuardStatus(): GuardStatus { return this.guard.getStatus(); }
  getActiveOrders(): OrderState[] { return this.orderManager?.getActiveOrders() ?? []; }
  getJournal(): LiveTradingJournal { return this.journal; }
  getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    if (!this.adapter) throw new Error('Orderbook only available in LIVE mode');
    return this.adapter.getOrderBook(tokenId);
  }

  async submitSignal(signal: TradeSignal, strategyName: string): Promise<PolymarketOrderResponse> {
    if (!this.orderManager) throw new Error('submitSignal only available in LIVE mode');
    return this.orderManager.submitSignal(signal, strategyName);
  }

  async executeStrategyTick(strategyKey: string, tickFn: () => Promise<void>): Promise<void> {
    const gate = await this.riskManager.check(strategyKey);
    if (!gate.allowed) {
      logger.warn(`Strategy tick skipped for ${strategyKey}: ${gate.reason}`, 'Orchestrator');
      return;
    }
    try { await tickFn(); } catch (err) {
      logger.error(`Strategy tick failed for ${strategyKey}`, 'Orchestrator', { err: String(err) });
    }
  }

  updatePaperPnl(strategyKey: string, pnlDelta: number): void { this.strategyExecutor.updatePaperPnl(strategyKey, pnlDelta); }
  getPaperStats() { return this.strategyExecutor.getPaperStats(); }
  getRiskManager(): RiskGateManager { return this.riskManager; }

  private subscribeToPriceUpdates(): void { this.eventSubscriber.subscribe(); }
  private unsubscribeFromPriceUpdates(): void { this.eventSubscriber.unsubscribe(); }

  private async persistState(): Promise<void> {
    await persistOrchestratorState({ journal: this.journal, guard: this.guard, positionTracker: this.positionTracker });
  }
  private async restoreState(): Promise<void> {
    await restoreOrchestratorState({ journal: this.journal, guard: this.guard, positionTracker: this.positionTracker });
  }
}
