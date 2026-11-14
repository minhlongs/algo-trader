/** Live Trading Orchestrator — Adapter, OrderManager, Guard, PolyRiskGate, V2 Gate, Tracker, Reconciler. */

import { EventEmitter } from 'events';
import type { PolymarketAdapter, PolymarketOrderResponse, PolymarketOrderBook } from '../execution/polymarket-adapter';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import type { LivePositionTracker, PositionSummary } from '../execution/live-position-tracker';
import type { LiveOrderManager, OrderState } from '../execution/live-order-manager';
import type { LiveExecutionGuard, GuardStatus } from '../execution/live-execution-guard';
import type { LiveTradingJournal } from '../execution/live-trading-journal';
import type { RiskGateManager } from '../risk/risk-gate-manager';
import type { PolymarketOrderReconciler, ReconciliationSummary } from '../execution/polymarket-order-reconciler';
import type { PolyKillSwitch } from '../risk/poly-kill-switch';
import type { PolymarketV2PreTradeRiskGate } from '../execution/polymarket-v2-pretrade-risk-gate';
import { setStrategyActive } from '../../platform/middleware/prometheus-metrics';
import { logger } from '../../shared/utils/logger';
import type { TradeSignal } from './strategy-live-bridge';
import type { LiveTradingStrategyExecutor } from './live-trading-strategy-executor';
import type { OrchestratorStatus, LiveTradingConfig } from './live-trading-types';
import type { FeeScheduleResolver } from './fee-schedule-resolver';
import {
  normalizeConfig, buildCoreComponents, buildStartComponents, executePaperOrderPlacement,
  recordPaperOrderCancel, validateOrchestratorOrderV2, type OrchestratorComponents,
} from './live-trading-adapter-setup';
import type { PaperOrderBookProvider, PaperLegDecayTracker, Leg2DecayStats } from './paper-orderbook-simulator';
import {
  PolymarketMicrostructureTracker, executeOrchestratorMarketRedemption,
  type RawOrderBookSnapshotInput, type TokenMicrostructureTelemetry, type UnrealizedMtmResult,
} from './polymarket-microstructure-tracker';
import type { OfiSnapshotResult, OnchainOrderFilledEvent } from './onchain-ofi-vpin-estimator';
import { persistOrchestratorState, restoreOrchestratorState } from './live-trading-state-persistence';
import { LiveTradingEventSubscriber } from './live-trading-event-subscriber';
import { createOrchestratorPolyRiskRuntime, type OrchestratorPolyRiskRuntime } from './live-trading-poly-risk-gate';

export * from './live-trading-public';

export class LiveTradingOrchestrator extends EventEmitter {
  private status: OrchestratorStatus = 'stopped';
  private config: LiveTradingConfig;
  private adapter: PolymarketAdapter | null = null;
  private positionTracker!: LivePositionTracker;
  private orderManager: LiveOrderManager | null = null;
  private guard!: LiveExecutionGuard;
  private journal!: LiveTradingJournal;
  private riskManager!: RiskGateManager;
  private strategyExecutor!: LiveTradingStrategyExecutor;
  private reconciler!: PolymarketOrderReconciler;
  private legDecayTracker!: PaperLegDecayTracker;
  private polymarketV2Gate!: PolymarketV2PreTradeRiskGate;
  private microstructureTracker!: PolymarketMicrostructureTracker;
  private tickSizeMicroResolver: ((tokenId: string) => number) | null = null;
  private paperOrderBookProvider: PaperOrderBookProvider | null = null;
  private startedAtMs = 0;
  private eventSubscriber!: LiveTradingEventSubscriber;
  private polyRisk: OrchestratorPolyRiskRuntime;

  constructor(rawConfig: LiveTradingConfig) {
    super();
    this.config = normalizeConfig(rawConfig);
    this.assignCore(buildCoreComponents(this.config));
    this.polyRisk = createOrchestratorPolyRiskRuntime({
      config: this.config, getOrderManager: () => this.orderManager,
      getPositionTracker: () => this.positionTracker, getReconciler: () => this.reconciler,
      getJournal: () => this.journal,
    });
  }
  private assignCore(c: OrchestratorComponents): void {
    Object.assign(this, c);
    this.eventSubscriber = new LiveTradingEventSubscriber(() => this.status, this.positionTracker);
  }
  setPaperOrderBookProvider(provider: PaperOrderBookProvider | null): void { this.paperOrderBookProvider = provider; }
  setFeeScheduleResolver(resolver: FeeScheduleResolver | null): void { this.polyRisk.setFeeScheduleResolver(resolver); }
  recordMarketObservation(observedAtMs = Date.now()): void { this.polyRisk.recordMarketObservation(observedAtMs); }
  getPolyKillSwitch(): PolyKillSwitch { return this.polyRisk.killSwitch; }
  setTickSizeMicroResolver(resolver: ((tokenId: string) => number) | null): void { this.tickSizeMicroResolver = resolver; }
  getTickSizeMicro(tokenId: string): number { return this.tickSizeMicroResolver?.(tokenId) ?? 10_000; }
  getPolymarketV2Gate(): PolymarketV2PreTradeRiskGate { return this.polymarketV2Gate; }
  getStartedAtMs(): number { return this.startedAtMs; }
  getLeg2DecayStats(): Leg2DecayStats { return this.legDecayTracker.getStats(); }
  recordOrderBookSnapshot(tokenId: string, book: RawOrderBookSnapshotInput): OfiSnapshotResult { return this.microstructureTracker.recordOrderBookSnapshot(tokenId, book); }
  recordTradePrint(tokenId: string, event: Pick<OnchainOrderFilledEvent, 'makerAssetId' | 'sharesMicro' | 'notionalUsdMicro'>): number { return this.microstructureTracker.recordTradePrint(tokenId, event); }
  recordBookError(tokenId: string): number { return this.microstructureTracker.recordBookError(tokenId); }
  getMicrostructureTelemetry(tokenId: string): TokenMicrostructureTelemetry { return this.microstructureTracker.getTelemetry(tokenId); }
  settleMarketRedemption(params: { marketId?: string; tokenId: string; payoutPerShareUsdc: 0 | 1 }) {
    return executeOrchestratorMarketRedemption({ reconciler: this.reconciler, positionTracker: this.positionTracker, journal: this.journal, legDecayTracker: this.legDecayTracker, startedAtMs: this.startedAtMs, mode: this.getMode(), ...params });
  }
  computeUnrealizedMtm(tokenId: string, bidLevels: Array<{ price: number; size: number }>, exitFeeBps = 0): UnrealizedMtmResult & { unrealizedMtmUsdc: number } {
    return this.reconciler.computeUnrealizedMtm(tokenId, bidLevels, exitFeeBps);
  }
  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'starting';
    const mode = this.getMode();
    logger.info(`Orchestrator starting in ${mode} mode`, 'Orchestrator', { capital: this.config.capitalUsdc });
    try {
      const c = buildCoreComponents(this.config);
      this.assignCore(c);
      this.guard.attachTracker(this.positionTracker);
      this.polyRisk.resetPeakEquity();
      await this.restoreState({
        failClosed: !this.config.paperTrading,
        allowCohortContinuation: Boolean(this.config.paperTrading && this.config.allowCohortContinuation),
      });
      buildStartComponents(this.config, c, (id) => this.getTickSizeMicro(id), (id) => this.microstructureTracker.getRiskContext(id));
      this.adapter = c.adapter;
      this.orderManager = c.orderManager;
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
    this.eventSubscriber.unsubscribe();
    if (this.orderManager) await this.orderManager.stop();
    await this.persistState();
    this.status = 'stopped';
    setStrategyActive('live-orchestrator', false);
    this.emit('stopped');
  }
  async placeOrder(order: PolymarketOrder): Promise<PolymarketOrderResponse> {
    if (this.status !== 'running') throw new Error('Orchestrator not running');
    await this.polyRisk.authorizeOrder(order, this.guard, order.orderType);
    validateOrchestratorOrderV2({
      polymarketV2Gate: this.polymarketV2Gate, positionTracker: this.positionTracker, journal: this.journal, order,
      getTickSizeMicro: (id) => this.getTickSizeMicro(id), getRiskContext: (id) => this.microstructureTracker.getRiskContext(id),
    });
    if (this.orderManager) return this.orderManager.submitAndTrack(order);
    return executePaperOrderPlacement({
      reconciler: this.reconciler, positionTracker: this.positionTracker, journal: this.journal,
      legDecayTracker: this.legDecayTracker, microstructureTracker: this.microstructureTracker,
      orderBookProvider: this.paperOrderBookProvider, feeScheduleResolver: this.polyRisk.getFeeScheduleResolver(),
      startedAtMs: this.startedAtMs, order, orderId: `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }
  async cancelOrder(orderId: string): Promise<void> {
    if (this.orderManager) await this.orderManager.cancelOrder(orderId);
    recordPaperOrderCancel(this.reconciler, orderId);
  }
  cancelAllOrders(tokenId?: string): Promise<void> { return this.polyRisk.cancelMatchingOrders(tokenId); }
  async getOpenOrders(tokenId?: string) { return this.polyRisk.listOpenOrders(tokenId); }
  getStatus(): OrchestratorStatus { return this.status; }
  getMode(): 'PAPER' | 'LIVE' { return this.config.paperTrading ? 'PAPER' : 'LIVE'; }
  getPositions() { return this.positionTracker.getPositions(); }
  getPositionSummary(): PositionSummary { return this.positionTracker.getSummary(); }
  getGuardStatus(): GuardStatus { return this.guard.getStatus(); }
  getActiveOrders(): OrderState[] { return this.orderManager?.getActiveOrders() ?? []; }
  getJournal(): LiveTradingJournal { return this.journal; }
  getReconciler(): PolymarketOrderReconciler { return this.reconciler; }
  getReconciliationSummary(): ReconciliationSummary { return this.reconciler.reconcile(); }
  getOrderBook(tokenId: string): Promise<PolymarketOrderBook> {
    if (!this.adapter) throw new Error('Orderbook only available in LIVE mode');
    return this.adapter.getOrderBook(tokenId).then((book) => {
      this.polyRisk.recordMarketObservation(Date.now());
      return book;
    });
  }
  async submitSignal(signal: TradeSignal, strategyName: string): Promise<PolymarketOrderResponse> {
    if (this.polyRisk.isKillSwitchFired() || this.config.enforcePolyRiskGate) {
      await this.polyRisk.authorizeOrder({
        tokenId: signal.tokenId, side: signal.side, price: signal.price, size: signal.size,
        expiration: Math.floor(Date.now() / 1000) + 300, nonce: String(Date.now()), feeRateBps: 0, signatureType: 0, orderType: signal.orderType,
      }, this.guard, signal.orderType);
    }
    if (!this.orderManager) throw new Error('submitSignal only available in LIVE mode');
    if (this.status !== 'running') throw new Error('Orchestrator not running');
    return this.orderManager.submitSignal(signal, strategyName);
  }
  async executeStrategyTick(strategyKey: string, tickFn: () => Promise<void>): Promise<void> {
    if (this.polyRisk.isKillSwitchFired()) { logger.warn(`Strategy tick skipped for ${strategyKey}: kill switch latched`, 'Orchestrator'); return; }
    const gate = await this.riskManager.check(strategyKey);
    if (!gate.allowed) { logger.warn(`Strategy tick skipped for ${strategyKey}: ${gate.reason}`, 'Orchestrator'); return; }
    try { await tickFn(); } catch (err) { logger.error(`Strategy tick failed for ${strategyKey}`, 'Orchestrator', { err: String(err) }); }
  }
  updatePaperPnl(strategyKey: string, pnlDelta: number): void { this.strategyExecutor.updatePaperPnl(strategyKey, pnlDelta); }
  getPaperStats() { return this.strategyExecutor.getPaperStats(); }
  getRiskManager(): RiskGateManager { return this.riskManager; }
  private subscribeToPriceUpdates(): void { this.eventSubscriber.subscribe(); }
  private unsubscribeFromPriceUpdates(): void { this.eventSubscriber.unsubscribe(); }
  private async persistState(): Promise<void> {
    await persistOrchestratorState({
      journal: this.journal, guard: this.guard, positionTracker: this.positionTracker,
      reconciler: this.reconciler, startedAtMs: this.startedAtMs, mode: this.getMode(), leg2DecayStats: this.legDecayTracker.getStats(),
    });
  }
  private async restoreState(options: { failClosed?: boolean; allowCohortContinuation?: boolean } = {}): Promise<void> {
    await restoreOrchestratorState({
      journal: this.journal, guard: this.guard, positionTracker: this.positionTracker,
      reconciler: this.reconciler, startedAtMs: this.startedAtMs, mode: this.getMode(), onStartedAtMs: (ts) => { this.startedAtMs = ts; },
    }, options);
  }
}
