/**
 * Live Trading Orchestrator — Adapter & Component Factory
 *
 * Builds and wires the Polymarket adapter, position tracker, guard, journal,
 * risk manager, and strategy executor from a LiveTradingConfig.
 * Handles both constructor init and start()-time adapter build.
 */

import { buildPolymarketAdapter } from '../execution/polymarket-execution-adapter';
import { CircuitBreaker } from '../risk/circuit-breaker';
import type { PolymarketAdapter } from '../execution/polymarket-adapter';
import { LivePositionTracker } from '../execution/live-position-tracker';
import { LiveExecutionGuard } from '../execution/live-execution-guard';
import { LiveTradingJournal } from '../execution/live-trading-journal';
import { RiskGateManager } from '../risk/risk-gate-manager';
import { LiveOrderManager } from '../execution/live-order-manager';
import { logger } from '../../shared/utils/logger';
import type { LiveTradingConfig } from './live-trading-types';
import { LiveTradingStrategyExecutor } from './live-trading-strategy-executor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorComponents {
  adapter: PolymarketAdapter | null;
  positionTracker: LivePositionTracker;
  orderManager: LiveOrderManager | null;
  guard: LiveExecutionGuard;
  journal: LiveTradingJournal;
  riskManager: RiskGateManager;
  strategyExecutor: LiveTradingStrategyExecutor;
}

// ---------------------------------------------------------------------------
// Config normalization
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Factory — constructor init (no adapter, no orderManager)
// ---------------------------------------------------------------------------

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
  const riskManager = new RiskGateManager(guard, new CircuitBreaker());
  const strategyExecutor = new LiveTradingStrategyExecutor(
    riskManager,
    (msg, ctx, meta) => logger.warn(msg, ctx, meta),
  );
  return { adapter: null, positionTracker, orderManager: null, guard, journal, riskManager, strategyExecutor };
}

// ---------------------------------------------------------------------------
// Factory — start() build (creates adapter + orderManager if live)
// ---------------------------------------------------------------------------

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

// Backward-compat aliases
export const buildOrchestratorComponents = buildCoreComponents;
export const buildAdapter = buildStartComponents;
/** @deprecated Use OrchestratorComponents */
export type AdapterComponents = OrchestratorComponents;
