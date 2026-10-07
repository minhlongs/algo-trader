/**
 * Drawdown Kill Switch Circuit Breaker Types
 *
 * Contracts for high-water mark tracking, progressive risk de-risking stages,
 * and emergency portfolio liquidation triggers.
 *
 * @module desk/risk/drawdown-kill-switch-types
 */

export type CircuitBreakerLevel = 'NORMAL' | 'STAGE_1_THROTTLE' | 'STAGE_2_FREEZE' | 'STAGE_3_KILL_SWITCH';

export interface DrawdownThresholdConfig {
  readonly stage1ThresholdPct: number; // e.g. 5% -> throttle quote sizes by 50%
  readonly stage2ThresholdPct: number; // e.g. 10% -> cancel open quotes & pause new entries
  readonly stage3ThresholdPct: number; // e.g. 15% -> emergency portfolio flattening
}

export interface DrawdownStatus {
  readonly currentEquityUsd: number;
  readonly highWaterMarkUsd: number;
  readonly drawdownUsd: number;
  readonly drawdownPct: number;
  readonly state: CircuitBreakerLevel;
  readonly quotingSizeMultiplier: number;
  readonly canOpenNewPositions: boolean;
  readonly requiresEmergencyFlattening: boolean;
}
