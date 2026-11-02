/**
 * Live Trading Orchestrator — Adapter & Component Factory
 *
 * Builds and wires the Polymarket adapter, position tracker, guard, journal,
 * risk manager, reconciler, and paper orderbook simulator from a LiveTradingConfig.
 */

import { buildPolymarketAdapter } from '../execution/polymarket-execution-adapter';
import { CircuitBreaker } from '../risk/circuit-breaker';
import type { PolymarketAdapter, PolymarketOrderResponse } from '../execution/polymarket-adapter';
import type { PolymarketOrder } from '../execution/polymarket-signer';
import { LivePositionTracker } from '../execution/live-position-tracker';
import { LiveExecutionGuard } from '../execution/live-execution-guard';
import { LiveTradingJournal } from '../execution/live-trading-journal';
import { RiskGateManager } from '../risk/risk-gate-manager';
import { LiveOrderManager } from '../execution/live-order-manager';
import { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import {
  extractPaperOrderParams,
  sweepOrderBookLevels,
  applyPaperOrderOutcome,
  PaperLegDecayTracker,
  type PaperOrderBookProvider,
} from './paper-orderbook-simulator';
import { saveReconcilerState, appendG2ShadowTelemetry } from './g2-shadow-telemetry';
import { logger } from '../../shared/utils/logger';
import type { LiveTradingConfig } from './live-trading-types';
import { LiveTradingStrategyExecutor } from './live-trading-strategy-executor';

export interface OrchestratorComponents {
  adapter: PolymarketAdapter | null;
  positionTracker: LivePositionTracker;
  orderManager: LiveOrderManager | null;
  guard: LiveExecutionGuard;
  journal: LiveTradingJournal;
  riskManager: RiskGateManager;
  strategyExecutor: LiveTradingStrategyExecutor;
  reconciler: PolymarketOrderReconciler;
  legDecayTracker: PaperLegDecayTracker;
}

/** Normalize config with defaults and PAPER_MODE env fallback. */
export function normalizeConfig(raw: LiveTradingConfig): LiveTradingConfig {
  const envPaperMode = process.env['PAPER_MODE'];
  const paperTrading =
    raw.paperTrading ?? (envPaperMode !== undefined ? envPaperMode !== 'false' : true);
  return {
    capitalUsdc: raw.capitalUsdc,
    paperTrading,
    maxPositionFraction: raw.maxPositionFraction ?? 0.02,
    maxDailyDrawdown: raw.maxDailyDrawdown ?? 0.05,
    maxConcurrentPositions: raw.maxConcurrentPositions ?? 10,
    maxConsecutiveLosses: raw.maxConsecutiveLosses ?? 3,
  };
}

/** Build core components for constructor init (paper-ready, no adapter). */
export function buildCoreComponents(config: LiveTradingConfig): OrchestratorComponents {
  const positionTracker = new LivePositionTracker(config.capitalUsdc);
  const guard = new LiveExecutionGuard({
    capitalUsdc: config.capitalUsdc,
    maxPositionFraction: config.maxPositionFraction,
    maxDailyDrawdown: config.maxDailyDrawdown,
    maxConcurrentPositions: config.maxConcurrentPositions,
    maxConsecutiveLosses: config.maxConsecutiveLosses,
    enabled: !config.paperTrading,
  });
  guard.attachTracker(positionTracker);
  const journal = new LiveTradingJournal();
  const cb = config.paperTrading ? undefined : new CircuitBreaker(undefined, { failClosed: true });
  const riskManager = new RiskGateManager(guard, cb);
  const strategyExecutor = new LiveTradingStrategyExecutor(
    riskManager,
    (msg, ctx, meta) => logger.warn(msg, ctx, meta),
  );
  const reconciler = new PolymarketOrderReconciler(config.capitalUsdc);
  const legDecayTracker = new PaperLegDecayTracker();
  return {
    adapter: null,
    positionTracker,
    orderManager: null,
    guard,
    journal,
    riskManager,
    strategyExecutor,
    reconciler,
    legDecayTracker,
  };
}

export async function executePaperOrderPlacement(params: {
  reconciler: PolymarketOrderReconciler;
  positionTracker: LivePositionTracker;
  journal: LiveTradingJournal;
  legDecayTracker: PaperLegDecayTracker;
  orderBookProvider: PaperOrderBookProvider | null;
  startedAtMs: number;
  order: PolymarketOrder;
  orderId: string;
}): Promise<PolymarketOrderResponse> {
  const { side, requestedSize, limitPrice } = extractPaperOrderParams(params.order);
  let book: { bids: Array<{ price: string; size: string }>; asks: Array<{ price: string; size: string }> } | null = null;
  if (params.orderBookProvider) {
    try {
      book = await params.orderBookProvider(params.order.tokenId);
    } catch {
      book = { bids: [], asks: [] };
    }
  }
  const outcome = sweepOrderBookLevels(book, side, requestedSize, limitPrice);
  params.legDecayTracker.recordOrderOutcome(params.order.tokenId, side, outcome);
  applyPaperOrderOutcome({
    reconciler: params.reconciler,
    positionTracker: params.positionTracker,
    journal: params.journal,
    order: params.order,
    orderId: params.orderId,
    side,
    outcome,
  });
  const loopStartedAt = params.startedAtMs > 0 ? params.startedAtMs : Date.now();
  const decayStats = params.legDecayTracker.getStats();
  saveReconcilerState(params.reconciler, loopStartedAt, decayStats);
  appendG2ShadowTelemetry({
    loopStartedAtMs: loopStartedAt,
    mode: 'PAPER',
    event: 'fill',
    positionSummary: params.positionTracker.getSummary(),
    reconciliationSummary: params.reconciler.reconcile(),
    leg2DecayStats: decayStats,
  });
  return {
    orderID: params.orderId,
    status: outcome.status,
    filledSize: outcome.filledSize,
    fillPrice: outcome.avgFillPrice,
    feeUsdc: outcome.feeUsdc,
    partial: outcome.partial,
  };
}

export function recordPaperOrderCancel(reconciler: PolymarketOrderReconciler, orderId: string): void {
  if (reconciler.getOrder(orderId)) {
    reconciler.applyEvent({
      eventId: `${orderId}:cancel:${Date.now()}`,
      orderId,
      type: 'CANCELLED',
      timestamp: Date.now(),
    });
  }
}

/** Build the Polymarket adapter and wire an OrderManager (for start()). */
export function buildStartComponents(config: LiveTradingConfig, core: OrchestratorComponents): void {
  const exec = buildPolymarketAdapter({
    paperTrading: config.paperTrading,
    chainId: config.chainId,
    apiUrl: config.apiUrl,
  });
  if (exec.adapter) {
    core.adapter = exec.adapter;
    core.guard.setEnabled(true);
    core.orderManager = new LiveOrderManager(exec.adapter, core.positionTracker);
  }
}

export const buildOrchestratorComponents = buildCoreComponents;
export const buildAdapter = buildStartComponents;
/** @deprecated Use OrchestratorComponents */
export type AdapterComponents = OrchestratorComponents;
