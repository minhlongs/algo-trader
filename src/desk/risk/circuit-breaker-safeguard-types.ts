/**
 * Real-Time Circuit Breaker Safeguard Types
 *
 * Domain contracts for monitoring drawdown boundaries, volatility shocks,
 * and emergency execution halts for prediction market trading.
 *
 * @module desk/risk/circuit-breaker-safeguard-types
 */

export type SafeguardState = 'NORMAL' | 'WARNING' | 'TRIPPED' | 'COOLING_DOWN';

export type SafeguardTripReason =
  | 'MAX_DRAWDOWN_BREACH'
  | 'VOLATILITY_SHOCK'
  | 'RAPID_LOSS_SPIKE'
  | 'ORACLE_DISPUTE_HALT'
  | 'MANUAL_EMERGENCY_HALT';

export interface SafeguardConfig {
  readonly maxDrawdownPct: number; // e.g. 0.05 for 5% max drawdown from peak
  readonly warningDrawdownPct?: number; // e.g. 0.03 for 3% warning threshold
  readonly maxLossPerMinuteUsd?: number; // max allowable loss in 1-minute window
  readonly volatilitySpikeThreshold?: number; // e.g. 2.5x normal rolling volatility
  readonly cooldownDurationMs?: number; // time to remain cooling down before reset
}

export interface SafeguardStatus {
  readonly state: SafeguardState;
  readonly peakNavUsd: number;
  readonly currentNavUsd: number;
  readonly currentDrawdownPct: number;
  readonly recentLossUsd: number;
  readonly isTradingAllowed: boolean;
  readonly trippedAt?: number;
  readonly tripReason?: SafeguardTripReason;
}

export interface EmergencyActionSignal {
  readonly actionId: string;
  readonly timestamp: number;
  readonly cancelAllOpenOrders: boolean;
  readonly flattenExposure: boolean;
  readonly reason: SafeguardTripReason;
  readonly message: string;
}
