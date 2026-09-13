/**
 * Live Execution Guard (Facade)
 *
 * Pre-execution safety gate — the LAST line of defense before an order reaches
 * the Polymarket CLOB. Every live trade passes through all 4 checks:
 *
 *   1. Position size ≤ maxPositionFraction of bankroll (quarter-Kelly default)
 *   2. Daily drawdown ≤ maxDailyDrawdown (5% default)
 *   3. Concurrent positions < maxConcurrentPositions (10 default)
 *   4. Circuit breaker is CLOSED (3 consecutive losses → OPEN)
 *
 * Composes existing risk infra — does not rewrite it.
 */

export type {
  GuardConfig,
  GuardChecks,
  GuardResult,
  GuardStatus,
} from './live-execution-guard-types';

export {
  DEFAULT_CONFIG,
} from './live-execution-guard-types';

export {
  LiveExecutionGuard,
} from './live-execution-guard-core';
