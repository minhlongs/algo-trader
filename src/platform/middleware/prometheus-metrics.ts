/**
 * Prometheus Metrics — Helper functions, Express middleware, and route handlers
 * Metric definitions live in prometheus-registry.ts
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/utils/logger';
import { annotateActiveSpanWithRegion } from '../../shared/utils/tracing';

// Import all metric definitions from registry (functions use them directly)
import {
  register,
  qwenPaperPnlPct,
  qwenSignalsTotal,
  qwenStrategyReviewsQueuedTotal,
  qwenStrategyReviewsResolvedTotal,
  qwenStrategyReviewBacklogSize,
  qwenStrategyReviewOldestPendingAgeSec,
  qwenAdminKillActionsTotal,
  qwenDrawdownPnlQueryErrorsTotal,
  qwenSignalsLoopRunsTotal,
  qwenSignalsLoopLastRunTs,
  qwenSignalsLoopJournalWriteErrorsTotal,
  qwenKillSwitchActive,
  qwenPaperGateDaysRemaining,
  qwenDrawdownAutoDisabled,
  qwenDrawdownMonitorLastRunTs,
  memoryRssBytes,
  memoryHeapBytes,
  memoryUtilizationRatio,
  memoryPressureEventsTotal,
  cacheEvictionsTotal,
  compressionRatio,
  tradesTotal,
  dailyPnlUsd,
  winRatePercent,
  circuitBreakerState,
  openPositionsTotal,
  exchangeApiLatency,
  signalsTotal,
  strategyActive,
  tradeExecutionTime,
  dataGapsTotal,
  gapDetectionDuration,
  expectedCandles,
  receivedCandles,
  candleCompleteness,
  outlierEventsTotal,
  outlierZScore,
  failoverEventsTotal,
  providerHealthScore,
  providerAvailability,
  providerErrorRate,
  slaComplianceTotal,
  httpRequestDuration,
  externalApiLatency,
  shardLatency,
  queueWaitTime,
} from './prometheus-registry';



// Re-export everything from registry for backward compatibility
export * from './prometheus-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

export function recordDataGap(provider: string, symbol: string, _durationMs?: number): void {
  dataGapsTotal.inc({ provider, symbol });
}

export function recordGapDetectionDuration(provider: string, symbol: string, seconds: number): void {
  gapDetectionDuration.observe(seconds);
}

export function setExpectedCandles(_provider: string, symbol: string, timeframe: string, count: number): void {
  expectedCandles.set({ symbol, timeframe }, count);
}

export function setReceivedCandles(provider: string, symbol: string, timeframe: string, count: number): void {
  receivedCandles.set({ symbol, timeframe }, count);
}

export function setCandleCompleteness(provider: string, symbol: string, timeframe: string, ratio: number): void {
  candleCompleteness.set({ symbol, timeframe }, ratio);
}

export function recordOutlierEvent(provider: string, symbol: string, field: string): void {
  outlierEventsTotal.inc({ provider, symbol, field });
}

export function recordOutlierZScore(provider: string, symbol: string, field: string, zScore: number): void {
  outlierZScore.observe({ provider, symbol, field }, zScore);
}

export function recordFailoverEvent(provider: string, direction: 'primary_to_fallback' | 'fallback_to_primary'): void {
  failoverEventsTotal.inc({ provider, direction });
}

export function setProviderHealthScore(provider: string, score: number): void {
  providerHealthScore.set({ provider }, score);
}

export function setProviderAvailability(provider: string, ratio: number): void {
  providerAvailability.set({ provider }, ratio);
}

export function setProviderErrorRate(provider: string, rate: number): void {
  providerErrorRate.set({ provider }, rate);
}

export function recordSlaCompliance(provider: string, compliant: boolean): void {
  slaComplianceTotal.inc({ provider, result: compliant ? 'compliant' : 'breached' });
}


// ─────────────────────────────────────────────────────────────────────────────
// Region-aware HTTP Request Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract region from Cloudflare request headers or context
 */
function getRegionFromRequest(req: Request): string {
  // CF provides region via cf-colo header
  try {
    const headers = req.headers as any;
    return headers.get?.('cf-colo') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Metrics tracking middleware with region context
 * Records HTTP request duration to Prometheus with region and status labels
 * Also annotates OpenTelemetry spans with region.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const region = getRegionFromRequest(req);
  const route = req.route?.path || req.path;
  const method = req.method;

  // Annotate active span with region (if tracing enabled)
  annotateActiveSpanWithRegion(region);

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = res.statusCode.toString();

    httpRequestDuration.observe({ method, route, region, status }, duration);
  });

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Endpoint Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Express handler for /metrics endpoint
 * Returns all metrics in Prometheus format
 */
export async function getMetrics(req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.send(metrics);
  } catch (error) {
    logger.error('Error generating metrics:', { error });
    res.status(500).send('Error generating metrics');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions for Recording Trading Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a completed trade
 */
export function recordTrade(symbol: string, exchange: string, side: 'buy' | 'sell', pnlUsd?: number): void {
  tradesTotal.inc({ symbol, exchange, side });

  if (pnlUsd !== undefined) {
    // Update daily P&L
    dailyPnlUsd.inc({ strategy: 'default' }, pnlUsd);
  }
}

/**
 * Record a trading signal
 */
export function recordSignal(symbol: string, signalType: 'buy' | 'sell' | 'hold'): void {
  signalsTotal.inc({ symbol, signal_type: signalType });
}

/**
 * Record exchange API latency
 */
export function recordExchangeLatency(exchange: string, operation: string, latencySeconds: number): void {
  exchangeApiLatency.observe({ exchange, operation }, latencySeconds);
}

/**
 * Record trade execution time
 */
export function recordTradeExecutionTime(exchange: string, symbol: string, durationSeconds: number): void {
  tradeExecutionTime.observe({ exchange, symbol }, durationSeconds);
}

/**
 * Update circuit breaker state
 */
export function setCircuitBreakerState(isOpen: boolean): void {
  circuitBreakerState.set(isOpen ? 1 : 0);
}

/**
 * Update win rate
 */
export function setWinRate(winRate: number): void {
  winRatePercent.set({ strategy: 'default' }, winRate);
}

/**
 * Update open positions count
 */
export function setOpenPositions(symbol: string, exchange: string, count: number): void {
  openPositionsTotal.set({ symbol, exchange }, count);
}

/**
 * Set strategy active/inactive
 */
export function setStrategyActive(strategy: string, active: boolean): void {
  strategyActive.set({ strategy }, active ? 1 : 0);
}
/**
 * Set L4 paper-gate days remaining (clamped to [0, 30]).
 * 0 = gate cleared (≥30 days of paper history); 30 = no paper trades yet.
 */
export function setQwenPaperGateDaysRemaining(days: number): void {
  const clamped = Math.max(0, Math.min(30, Math.round(days * 10) / 10));
  qwenPaperGateDaysRemaining.set(clamped);
}

/** Set L3 drawdown auto-disable state. */
export function setQwenDrawdownAutoDisabled(disabled: boolean): void {
  qwenDrawdownAutoDisabled.set(disabled ? 1 : 0);
}

/**
 * Update memory metrics from MemoryPressureHandler
 * Called every 5s by memory pressure monitoring
 */
export function setMemoryMetrics(
  rssBytes: number,
  heapBytes: number,
  limitBytes: number
): void {
  memoryRssBytes.set(rssBytes);
  memoryHeapBytes.set(heapBytes);
  memoryUtilizationRatio.set(rssBytes / limitBytes);
}

/**
 * Record memory pressure event
 */
export function recordMemoryPressureEvent(level: 'warning' | 'critical'): void {
  memoryPressureEventsTotal.inc({ level });
}

/**
 * Record cache eviction
 */
export function recordCacheEviction(cacheType: 'strategy' | 'market_data' | 'agent_context'): void {
  cacheEvictionsTotal.inc({ cache_type: cacheType });
}

/**
 * Record compression ratio
 */
export function recordCompressionRatio(originalSize: number, compressedSize: number): void {
  if (compressedSize > 0) {
    compressionRatio.set(originalSize / compressedSize);
  }
}

// Helper function to record external API latency (with region)
export function recordExternalApiLatency(service: string, endpoint: string, region: string, latencySeconds: number): void {
  externalApiLatency.observe({ service, endpoint, region }, latencySeconds);
}

// Helper function to record shard latency
export function recordShardLatency(shardId: string, operation: string, latencySeconds: number): void {
  shardLatency.observe({ shard_id: shardId, operation }, latencySeconds);
}

// Helper function to record queue wait time
export function recordQueueWaitTime(priority: number, agent: string, tier: string, waitSeconds: number): void {
  queueWaitTime.observe({ priority: String(priority), agent, tier }, waitSeconds);
}

// Export registry for custom metrics
export { register };
