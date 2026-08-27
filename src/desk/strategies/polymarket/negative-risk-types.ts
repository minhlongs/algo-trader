/**
 * Negative Risk Scanner — types, defaults, and shared runtime context.
 *
 * Config, position shape, dependency contract, and the per-tick runtime that
 * the entry/exit evaluators operate on. Also holds the tiny cooldown helpers
 * shared by both entry scanning and exit evaluation.
 */

import type { ClobClient } from '../../polymarket/clob-client';
import type { OrderManager } from '../../polymarket/order-manager';
import type { EventBus } from '../../events/event-bus';
import type { GammaClient } from '../../polymarket/gamma-client';
import type { StrategyName } from '../../core/types';

// ── Config ───────────────────────────────────────────────────────────────────

export interface NegativeRiskScannerConfig {
  /** Sum of yesAsk + noAsk must be below this to trigger (e.g., 0.98) */
  threshold: number;
  /** Maximum USD value per leg (YES and NO) */
  maxOpportunitySizeUsdc: number;
  /** Cooldown period per market after entry (ms) */
  cooldownMs: number;
  /** Minimum market volume (USDC) to consider */
  minVolumeUsdc: number;
  /** Take-profit as fraction of entry cost (default: 0.02 = 2%) */
  takeProfitPct?: number;
  /** Stop-loss as fraction (default: 0.015 = 1.5%) */
  stopLossPct?: number;
  /** Maximum hold time before forced exit (ms) */
  maxHoldMs?: number;
}

export const DEFAULT_CONFIG: NegativeRiskScannerConfig = {
  threshold: 0.98,
  maxOpportunitySizeUsdc: 10,
  cooldownMs: 30_000,
  minVolumeUsdc: 1000,
  takeProfitPct: 0.02,
  stopLossPct: 0.015,
  maxHoldMs: 60 * 60_000, // 1 hour
};

export const STRATEGY_NAME = 'negative-risk-scanner' as StrategyName;

// ── Internal types ───────────────────────────────────────────────────────────

export interface ArbPosition {
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
  yesEntryPrice: number;
  noEntryPrice: number;
  yesSizeUsdc: number;
  noSizeUsdc: number;
  yesOrderId: string;
  noOrderId: string;
  openedAt: number;
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface NegativeRiskScannerDeps {
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
  config?: Partial<NegativeRiskScannerConfig>;
}

// ── Runtime context ──────────────────────────────────────────────────────────

/**
 * Per-tick shared state + resolved config + dependencies. Built once by the
 * tick factory and threaded through the entry/exit evaluators.
 */
export interface ScannerRuntime {
  /** conditionId → open arb position */
  positions: Map<string, ArbPosition>;
  /** conditionId → cooldown-until timestamp (ms) */
  cooldowns: Map<string, number>;
  cfg: NegativeRiskScannerConfig;
  clob: ClobClient;
  orderManager: OrderManager;
  eventBus: EventBus;
  gamma: GammaClient;
}

/** Whether a market is still within its cooldown window. */
export function isOnCooldown(runtime: ScannerRuntime, conditionId: string): boolean {
  const until = runtime.cooldowns.get(conditionId) ?? 0;
  return Date.now() < until;
}

/** Arm the cooldown for a market starting now. */
export function setCooldown(runtime: ScannerRuntime, conditionId: string): void {
  runtime.cooldowns.set(conditionId, Date.now() + runtime.cfg.cooldownMs);
}
