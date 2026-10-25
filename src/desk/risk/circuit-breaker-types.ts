/**
 * Circuit Breaker Domain Types and Default Configuration
 */

export interface CircuitBreakerConfig {
  maxLossStreak: number;
  maxLatencyMs: number;
  maxVolatilityPercent: number;
  cooldownMs: number;
  maxDailyDrawdown: number; // 5% default
  /** When true, Redis connection/read failure trips circuit OPEN (fail-closed for LIVE trading). */
  failClosed?: boolean;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitStatus {
  state: CircuitState;
  reason?: string;
  triggeredAt?: number;
  cooldownRemaining?: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxLossStreak: 3,
  maxLatencyMs: 1000,
  maxVolatilityPercent: 5.0,
  cooldownMs: 300000, // 5 minutes
  maxDailyDrawdown: 0.05, // 5% daily drawdown
};

/** Parse Redis hash into circuit state snapshot */
export function parseRedisCircuitStatus(
  status: Record<string, string> | null | undefined,
  current: { state: CircuitState; reason?: string; triggeredAt?: number },
): { state: CircuitState; reason?: string; triggeredAt?: number } {
  if (!status?.state) return current;
  return {
    state: status.state as CircuitState,
    reason: status.reason,
    triggeredAt: status.triggeredAt ? parseInt(status.triggeredAt) : undefined,
  };
}

/** Pure cooldown and HALF_OPEN state transition evaluation */
export function resolveSyncCircuitStatus(
  state: CircuitState,
  reason: string | undefined,
  triggeredAt: number | undefined,
  cooldownMs: number,
  now: number = Date.now(),
): { nextState: CircuitState; status: CircuitStatus } {
  if (state === 'OPEN' && triggeredAt) {
    const elapsed = now - triggeredAt;
    const remaining = Math.max(0, cooldownMs - elapsed);
    if (remaining <= 0) {
      return {
        nextState: 'HALF_OPEN',
        status: { state: 'HALF_OPEN', reason, triggeredAt, cooldownRemaining: 0 },
      };
    }
    return {
      nextState: 'OPEN',
      status: { state: 'OPEN', reason, triggeredAt, cooldownRemaining: remaining },
    };
  }
  return { nextState: state, status: { state, reason, triggeredAt } };
}
