/**
 * Live Execution Guard Types and Defaults
 */

export interface GuardConfig {
  /** Max fraction of capital allowed per position (default: 0.02 = 2%) */
  maxPositionFraction: number;
  /** Max daily drawdown before ALL trading halts (default: 0.05 = 5%) */
  maxDailyDrawdown: number;
  /** Max number of concurrent open positions (default: 10) */
  maxConcurrentPositions: number;
  /** Consecutive losses that trip the circuit breaker (default: 3) */
  maxConsecutiveLosses: number;
  /** Total capital for position size calculation */
  capitalUsdc: number;
  /** Set to false to disable the guard (PAPER mode) */
  enabled: boolean;
}

export interface GuardChecks {
  positionSizeOk: boolean;
  dailyDrawdownOk: boolean;
  concurrentLimitOk: boolean;
  circuitBreakerOk: boolean;
}

export interface GuardResult {
  approved: boolean;
  reason?: string;
  checks: GuardChecks;
}

export interface GuardStatus {
  enabled: boolean;
  consecutiveLosses: number;
  totalLosses: number;
  totalWins: number;
  circuitTripped: boolean;
  dailyPnl: number;
  openPositions: number;
}

export const DEFAULT_CONFIG: Omit<GuardConfig, 'capitalUsdc'> = {
  maxPositionFraction: 0.02,
  maxDailyDrawdown: 0.05,
  maxConcurrentPositions: 10,
  maxConsecutiveLosses: 3,
  enabled: false, // DISABLED by default — operator must opt into live trading
};
