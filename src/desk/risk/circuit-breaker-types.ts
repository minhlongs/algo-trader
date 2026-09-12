/**
 * Circuit Breaker Domain Types and Default Configuration
 */

export interface CircuitBreakerConfig {
  maxLossStreak: number;
  maxLatencyMs: number;
  maxVolatilityPercent: number;
  cooldownMs: number;
  maxDailyDrawdown: number; // 5% default
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
