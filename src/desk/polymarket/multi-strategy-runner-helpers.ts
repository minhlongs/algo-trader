/**
 * Multi-Strategy Runner Types, Validation & Status Aggregation Helpers
 */

import type { LiveTradingOrchestrator, LiveTradingConfig } from './live-trading-orchestrator';
import type { StrategyRunner, RunnerStatus } from './strategy-runner';
import { getStrategy, type StrategyEntry } from './strategy-registry';

export interface MultiRunnerConfig {
  /** Strategy names to run (kebab-case registry keys) */
  strategies: string[];
  /** Trading config — all strategies share this */
  tradingConfig: LiveTradingConfig;
  /** Tick interval in ms (all strategies tick at same cadence, staggered) */
  tickIntervalMs?: number;
  /** Max ticks (0=unlimited, shared across all runners) */
  maxTicks?: number;
}

export interface MultiRunnerStatus {
  status: 'stopped' | 'running' | 'error';
  mode: 'PAPER' | 'LIVE';
  runnerCount: number;
  runners: Array<{
    strategy: string;
    status: RunnerStatus['status'];
    ticks: number;
    orders: number;
    positions: number;
  }>;
  summary: {
    totalTicks: number;
    totalOrders: number;
    totalPositions: number;
  };
}

export function resolveStrategyEntries(strategyNames: string[]): StrategyEntry[] {
  if (strategyNames.length === 0) {
    throw new Error('At least one strategy required');
  }

  const missing: string[] = [];
  const entries: StrategyEntry[] = [];
  for (const name of strategyNames) {
    const entry = getStrategy(name);
    if (!entry) missing.push(name);
    else entries.push(entry);
  }
  if (missing.length > 0) {
    throw new Error(`Unknown strategies: ${missing.join(', ')}`);
  }
  return entries;
}

export function buildMultiRunnerStatus(
  status: 'stopped' | 'running' | 'error',
  orchestrator: LiveTradingOrchestrator,
  runners: StrategyRunner[],
): MultiRunnerStatus {
  const positionCount = orchestrator.getPositions().length;
  const runnerStatuses = runners.map((r) => {
    const s = r.getStatus();
    return {
      strategy: s.strategyName,
      status: s.status,
      ticks: s.tickCount,
      orders: s.proxyStats.ordersPlaced,
      positions: positionCount,
    };
  });

  return {
    status,
    mode: orchestrator.getMode(),
    runnerCount: runners.length,
    runners: runnerStatuses,
    summary: {
      totalTicks: runnerStatuses.reduce((sum, r) => sum + r.ticks, 0),
      totalOrders: runnerStatuses.reduce((sum, r) => sum + r.orders, 0),
      totalPositions: positionCount,
    },
  };
}
