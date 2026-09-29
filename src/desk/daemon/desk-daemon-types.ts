/**
 * Desk Daemon Types & Invariant Verifiers
 * Milestone M3: Concurrent Multi-Engine Background Supervisor & Worker Daemon
 */

import * as z from 'zod';
import type { DeskAutoConfig, DeskAutoMode } from '../commands/desk-auto-types';
import type { UnifiedTradingLoop } from '../orchestrator/unified-trading-loop';
import type { UnifiedTradeIntent } from '../orchestrator/orchestrator-types';
import type { AutonomousLifecycleState } from '../orchestrator/autonomous-lifecycle-types';
import type { CircuitBreakerTier } from '../portfolio/types';
import type { DynamicMidPriceProvider } from '../feeds/dynamic-mid-price-provider';
import type { FeedFreshnessWatchdog } from '../feeds/feed-freshness-watchdog';
import type { MarketDataMultiplexer } from '../feeds/market-data-multiplexer';
import type { IEngineSupervisor } from './engine-supervisor-types';

import type { DeskMetricsRegistry } from '../telemetry/desk-metrics-registry';

export const DriftVerificationResultSchema = z.object({
  valid: z.boolean(),
  driftUsd: z.number().nonnegative(),
});
export type DriftVerificationResult = z.infer<typeof DriftVerificationResultSchema>;

export interface DeskDaemonOptions {
  readonly config: DeskAutoConfig;
  readonly loop?: UnifiedTradingLoop;
  readonly supervisor?: IEngineSupervisor;
  readonly watchdog?: FeedFreshnessWatchdog;
  readonly midPriceProvider?: DynamicMidPriceProvider;
  readonly multiplexer?: MarketDataMultiplexer;
  readonly reconciliationIntervalCycles?: number;
  readonly onHalt?: (reason: string) => void;
  readonly cancelAllOrders?: () => Promise<void>;
  readonly skipSignalHandlers?: boolean;
  readonly exitOnSignal?: boolean;
  readonly skipServer?: boolean;
  readonly metricsRegistry?: DeskMetricsRegistry;
}

export interface DaemonStatus {
  readonly status: AutonomousLifecycleState;
  readonly mode: DeskAutoMode;
  readonly capitalUsd: number;
  readonly dryRun: boolean;
  readonly circuitBreakerTier: CircuitBreakerTier;
  readonly navUsd: number;
  readonly uptimeSeconds: number;
  readonly cycleCount: number;
  readonly exchanges: string[];
  readonly symbols: string[];
  readonly engines: Record<string, { status: string; lastSignalTime?: number; error?: string }>;
  readonly driftUsd: number;
  readonly isDriftValid: boolean;
  readonly queueDepth: number;
  readonly processedOrders: number;
  readonly allocations: {
    readonly allocatedCapitalUsd: Record<string, number>;
    readonly unallocatedCashUsd: number;
    readonly driftUsd: number;
  };
}

/**
 * Verifies the Zero Accounting Drift invariant: |delta| < 10^-4 USD across balances.
 */
export function verifyZeroDrift(
  navUsd: number,
  allocated: Record<string, number>,
  unallocatedCash: number,
): DriftVerificationResult {
  const sumAllocated = Object.values(allocated).reduce((acc, v) => acc + v, 0);
  const driftUsd = Math.abs(navUsd - (sumAllocated + unallocatedCash));
  return { valid: driftUsd < 1e-4, driftUsd };
}

/**
 * Filters out expired intents (when now is provided) and sorts by institutional priority:
 * 1. Risk-reducing hedges (+100)
 * 2. Urgency: HIGH (+50) > MEDIUM (+25) > LOW (+10)
 * 3. Expected edge bps
 * 4. Sharpe ratio tie-breaker
 */
export function prioritizeTradeIntents(
  intents: readonly UnifiedTradeIntent[],
  now?: number,
): UnifiedTradeIntent[] {
  const unexpired = now !== undefined
    ? intents.filter((i) => !i.expiresAt || i.expiresAt > now)
    : intents;

  return [...unexpired].sort((a, b) => {
    const scoreA =
      (a.isRiskReducing ? 100 : 0) +
      (a.urgency === 'HIGH' ? 50 : a.urgency === 'MEDIUM' ? 25 : 10) +
      a.expectedEdgeBps;
    const scoreB =
      (b.isRiskReducing ? 100 : 0) +
      (b.urgency === 'HIGH' ? 50 : b.urgency === 'MEDIUM' ? 25 : 10) +
      b.expectedEdgeBps;

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    return (b.expectedSharpe ?? 0) - (a.expectedSharpe ?? 0);
  });
}
