/**
 * Live Trading Orchestrator — Adapter & Component Factory
 *
 * Builds and wires the Polymarket adapter, position tracker, guard, journal,
 * risk manager, reconciler, microstructure tracker, and paper orderbook simulator
 * from a LiveTradingConfig.
 */

import { buildPolymarketAdapter } from '../execution/polymarket-execution-adapter';
import { CircuitBreaker } from '../risk/circuit-breaker';
import type { PolymarketAdapter } from '../execution/polymarket-adapter';
import { LivePositionTracker } from '../execution/live-position-tracker';
import { LiveExecutionGuard } from '../execution/live-execution-guard';
import { LiveTradingJournal } from '../execution/live-trading-journal';
import { RiskGateManager } from '../risk/risk-gate-manager';
import { LiveOrderManager } from '../execution/live-order-manager';
import { PolymarketOrderReconciler } from '../execution/polymarket-order-reconciler';
import { PolymarketV2PreTradeRiskGate } from '../execution/polymarket-v2-pretrade-risk-gate';
import { PaperLegDecayTracker } from './paper-orderbook-simulator';
import { PolymarketMicrostructureTracker } from './polymarket-microstructure-tracker';
import { logger } from '../../shared/utils/logger';
import type { LiveTradingConfig } from './live-trading-types';
import { LiveTradingStrategyExecutor } from './live-trading-strategy-executor';

export { validateOrchestratorOrderV2 } from '../execution/polymarket-v2-pretrade-bridge';
export { executePaperOrderPlacement, recordPaperOrderCancel } from './live-trading-paper-execution';

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
  polymarketV2Gate: PolymarketV2PreTradeRiskGate;
  microstructureTracker: PolymarketMicrostructureTracker;
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
    chainId: raw.chainId,
    apiUrl: raw.apiUrl,
    feeScheduleResolver: raw.feeScheduleResolver,
    enforcePolyRiskGate: raw.enforcePolyRiskGate ?? (!paperTrading && raw.feeScheduleResolver !== undefined),
    killSwitchTransport: raw.killSwitchTransport,
    allowCohortContinuation: raw.allowCohortContinuation ?? false,
    preTradeRiskGateConfigV2: raw.preTradeRiskGateConfigV2,
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
  const polymarketV2Gate = new PolymarketV2PreTradeRiskGate({
    maxMarketExposureMicro: Math.max(7_500_000_000, Math.round(config.capitalUsdc * 1_000_000)),
    maxConsecutiveBookErrors: 3,
    ...config.preTradeRiskGateConfigV2,
  });
  const microstructureTracker = new PolymarketMicrostructureTracker(
    undefined,
    config.preTradeRiskGateConfigV2?.maxVpinThreshold ?? 0.70,
  );
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
    polymarketV2Gate,
    microstructureTracker,
  };
}

/** Build the Polymarket adapter and wire an OrderManager (for start()). */
export function buildStartComponents(
  config: LiveTradingConfig,
  core: OrchestratorComponents,
  getTickSizeMicro?: (tokenId: string) => number,
  getRiskContext?: (tokenId: string) => { currentVpin?: number; consecutiveBookErrors?: number },
): void {
  const exec = buildPolymarketAdapter({
    paperTrading: config.paperTrading,
    chainId: config.chainId,
    apiUrl: config.apiUrl,
  });
  if (exec.adapter) {
    core.adapter = exec.adapter;
    core.guard.setEnabled(true);
    core.orderManager = new LiveOrderManager(
      exec.adapter,
      core.positionTracker,
      undefined,
      core.riskManager,
      core.polymarketV2Gate,
      getTickSizeMicro,
      getRiskContext,
    );
  }
}

export const buildOrchestratorComponents = buildCoreComponents;
export const buildAdapter = buildStartComponents;
/** @deprecated Use OrchestratorComponents */
export type AdapterComponents = OrchestratorComponents;
