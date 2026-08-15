/**
 * Drawdown Monitor Platform Types
 *
 * Platform-layer types for drawdown evaluation, alerting, and persistence.
 * Desk-layer base types (DrawdownConfig, DrawdownMetrics, DrawdownAlert)
 * live in @desk/risk/drawdown-monitor-types.
 */

import type { DrawdownMetrics, DrawdownAlert } from '@desk/risk';

// ── Alert Tiers ───────────────────────────────────────────────────────────────

export enum DrawdownAlertTier {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EMERGENCY = 'EMERGENCY',
}

// ── Threshold Config ──────────────────────────────────────────────────────────

export interface DrawdownThresholdConfig {
  dailyDrawdownLimit: number;
  totalDrawdownLimit: number;
  consecutiveLossLimit: number;
  haltOnBreach: boolean;
}

export const DEFAULT_THRESHOLD_CONFIG: DrawdownThresholdConfig = {
  dailyDrawdownLimit: 0.05,
  totalDrawdownLimit: 0.15,
  consecutiveLossLimit: 5,
  haltOnBreach: true,
};

// ── Evaluation Result ─────────────────────────────────────────────────────────

export interface DrawdownThresholdEvaluation {
  type: 'daily' | 'total' | 'consecutive';
  breached: boolean;
  current: number;
  threshold: number;
  headroom: number; // threshold - current (negative when breached)
}

export interface DrawdownEvaluationResult {
  evaluations: DrawdownThresholdEvaluation[];
  tier: DrawdownAlertTier;
  shouldHalt: boolean;
  haltReason?: string;
  alerts: DrawdownAlert[];
}

// ── State Snapshot (persistence) ──────────────────────────────────────────────

export interface DrawdownStateSnapshot {
  currentValue: number;
  peakValue: number;
  consecutiveLosses: number;
  dailyStartValue: number;
  isHalted: boolean;
  haltedUntilMs?: number;
  snapshotAtMs: number;
}

// ── Throttle State ────────────────────────────────────────────────────────────

export interface DrawdownThrottleState {
  lastAlertAtMs: number;
  alertCount: number;
  suppressedCount: number;
}

// ── Enriched Alert Record ─────────────────────────────────────────────────────

export interface DrawdownAlertRecord extends DrawdownAlert {
  userId: string;
  tier: DrawdownAlertTier;
  persistedAtMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute drawdown fraction from peak and current values. Returns 0 for zero/negative peak or non-finite inputs. */
export function computeDrawdownFraction(peakValue: number, currentValue: number): number {
  if (!Number.isFinite(peakValue) || !Number.isFinite(currentValue)) return 0;
  if (peakValue <= 0) return 0;
  return Math.max(0, (peakValue - currentValue) / peakValue);
}

/** Compute daily drawdown fraction from daily start and current values. Returns 0 for zero/negative start or non-finite inputs. */
export function computeDailyDrawdownFraction(dailyStartValue: number, currentValue: number): number {
  if (!Number.isFinite(dailyStartValue) || !Number.isFinite(currentValue)) return 0;
  if (dailyStartValue <= 0) return 0;
  return Math.max(0, (dailyStartValue - currentValue) / dailyStartValue);
}

/** Build a DrawdownMetrics from raw values (pure, no Redis). */
export function buildMetricsSnapshot(params: {
  peakValue: number;
  currentValue: number;
  dailyStartValue: number;
  dailyPnl: number;
  consecutiveLosses: number;
  isHalted: boolean;
  maxDrawdownSoFar?: number;
}): DrawdownMetrics {
  const totalDrawdown = computeDrawdownFraction(params.peakValue, params.currentValue);
  const dailyDrawdown = computeDailyDrawdownFraction(params.dailyStartValue, params.currentValue);
  return {
    currentDrawdown: totalDrawdown,
    maxDrawdown: params.maxDrawdownSoFar ?? totalDrawdown,
    peakValue: params.peakValue,
    currentValue: params.currentValue,
    dailyPnl: params.dailyPnl,
    dailyDrawdown,
    consecutiveLosses: params.consecutiveLosses,
    isHalted: params.isHalted,
  };
}
