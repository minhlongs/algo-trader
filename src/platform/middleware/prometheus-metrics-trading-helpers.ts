/**
 * Trading Helper Functions for Prometheus Metrics
 *
 * Submodule extracted from prometheus-metrics.ts to keep files under 200 lines.
 * Contains helper functions for recording trading events and system metrics.
 */

import {
  tradesTotal,
  dailyPnlUsd,
  signalsTotal,
  exchangeApiLatency,
  tradeExecutionTime,
  circuitBreakerState,
  winRatePercent,
  openPositionsTotal,
  strategyActive,
  qwenPaperGateDaysRemaining,
  qwenDrawdownAutoDisabled,
  memoryRssBytes,
  memoryHeapBytes,
  memoryUtilizationRatio,
  memoryPressureEventsTotal,
  cacheEvictionsTotal,
  compressionRatio,
  externalApiLatency,
  shardLatency,
  queueWaitTime,
} from './prometheus-registry';

export function recordTrade(symbol: string, exchange: string, side: 'buy' | 'sell', pnlUsd?: number): void {
  tradesTotal.inc({ symbol, exchange, side });
  if (pnlUsd !== undefined) {
    dailyPnlUsd.inc({ strategy: 'default' }, pnlUsd);
  }
}

export function recordSignal(symbol: string, signalType: 'buy' | 'sell' | 'hold'): void {
  signalsTotal.inc({ symbol, signal_type: signalType });
}

export function recordExchangeLatency(exchange: string, operation: string, latencySeconds: number): void {
  exchangeApiLatency.observe({ exchange, operation }, latencySeconds);
}

export function recordTradeExecutionTime(exchange: string, symbol: string, durationSeconds: number): void {
  tradeExecutionTime.observe({ exchange, symbol }, durationSeconds);
}

export function setCircuitBreakerState(isOpen: boolean): void {
  circuitBreakerState.set(isOpen ? 1 : 0);
}

export function setWinRate(winRate: number): void {
  winRatePercent.set({ strategy: 'default' }, winRate);
}

export function setOpenPositions(symbol: string, exchange: string, count: number): void {
  openPositionsTotal.set({ symbol, exchange }, count);
}

export function setStrategyActive(strategy: string, active: boolean): void {
  strategyActive.set({ strategy }, active ? 1 : 0);
}

export function setQwenPaperGateDaysRemaining(days: number): void {
  const clamped = Math.max(0, Math.min(30, Math.round(days * 10) / 10));
  qwenPaperGateDaysRemaining.set(clamped);
}

export function setQwenDrawdownAutoDisabled(disabled: boolean): void {
  qwenDrawdownAutoDisabled.set(disabled ? 1 : 0);
}

export function setMemoryMetrics(rssBytes: number, heapBytes: number, limitBytes: number): void {
  memoryRssBytes.set(rssBytes);
  memoryHeapBytes.set(heapBytes);
  memoryUtilizationRatio.set(rssBytes / limitBytes);
}

export function recordMemoryPressureEvent(level: 'warning' | 'critical'): void {
  memoryPressureEventsTotal.inc({ level });
}

export function recordCacheEviction(cacheType: 'strategy' | 'market_data' | 'agent_context'): void {
  cacheEvictionsTotal.inc({ cache_type: cacheType });
}

export function recordCompressionRatio(originalSize: number, compressedSize: number): void {
  if (compressedSize > 0) {
    compressionRatio.set(originalSize / compressedSize);
  }
}

export function recordExternalApiLatency(service: string, endpoint: string, region: string, latencySeconds: number): void {
  externalApiLatency.observe({ service, endpoint, region }, latencySeconds);
}

export function recordShardLatency(shardId: string, operation: string, latencySeconds: number): void {
  shardLatency.observe({ shard_id: shardId, operation }, latencySeconds);
}

export function recordQueueWaitTime(priority: number, agent: string, tier: string, waitSeconds: number): void {
  queueWaitTime.observe({ priority: String(priority), agent, tier }, waitSeconds);
}
