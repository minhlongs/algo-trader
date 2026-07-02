/**
 * Prometheus Metrics Middleware + Helpers
 *
 * Express middleware for HTTP metrics tracking, /metrics endpoint handler,
 * and helper functions to record trading events.
 *
 * Metric definitions live in prometheus-metrics-definitions.ts (re-exported here).
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/utils/logger';
import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  tradesTotal,
  dailyPnlUsd,
  winRatePercent,
  circuitBreakerState,
  openPositionsTotal,
  exchangeApiLatency,
  signalsTotal,
  strategyActive,
  tradeExecutionTime,
  qwenKillSwitchActive,
  qwenPaperGateDaysRemaining,
  qwenDrawdownAutoDisabled,
  dataGapEvents,
  dataGapDuration,
  gapDetectionDuration,
  expectedCandles,
  receivedCandles,
  candleCompleteness,
  outlierEvents,
  outlierZScore,
  providerLatency,
  failoverEvents,
  circuitBreakerStateProvider,
  providerHealthScore,
  providerAvailability,
  providerErrorRate,
  slaCompliance,
} from './prometheus-metrics-definitions';

// Re-export definitions for backward compat
export * from './prometheus-metrics-definitions';

// ═══════════════════════════════════════════════════════════════════════════════
// Express Middleware
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware to track HTTP requests
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const path = req.route?.path || req.path;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = res.statusCode.toString();

    httpRequestsTotal.inc({ method: req.method, path, status });
    httpRequestDuration.observe({ method: req.method, path }, duration);
  });

  next();
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// Trading Event Recorders
// ═══════════════════════════════════════════════════════════════════════════════

/** Record a completed trade */
export function recordTrade(symbol: string, exchange: string, side: 'buy' | 'sell', pnlUsd?: number): void {
  tradesTotal.inc({ symbol, exchange, side });
  if (pnlUsd !== undefined) dailyPnlUsd.inc({ strategy: 'default' }, pnlUsd);
}

/** Record a trading signal */
export function recordSignal(symbol: string, signalType: 'buy' | 'sell' | 'hold'): void {
  signalsTotal.inc({ symbol, signal_type: signalType });
}

/** Record exchange API latency */
export function recordExchangeLatency(exchange: string, operation: string, latencySeconds: number): void {
  exchangeApiLatency.observe({ exchange, operation }, latencySeconds);
}

/** Record trade execution time */
export function recordTradeExecutionTime(exchange: string, symbol: string, durationSeconds: number): void {
  tradeExecutionTime.observe({ exchange, symbol }, durationSeconds);
}

/** Update circuit breaker state */
export function setCircuitBreakerState(isOpen: boolean): void {
  circuitBreakerState.set(isOpen ? 1 : 0);
}

/** Update win rate */
export function setWinRate(winRate: number): void {
  winRatePercent.set({ strategy: 'default' }, winRate);
}

/** Update open positions count */
export function setOpenPositions(symbol: string, exchange: string, count: number): void {
  openPositionsTotal.set({ symbol, exchange }, count);
}

/** Set strategy active/inactive */
export function setStrategyActive(strategy: string, active: boolean): void {
  strategyActive.set({ strategy }, active ? 1 : 0);
}

/** Set L1 kill-switch state for a given source (env flag or KV lookup) */
export function setQwenKillSwitch(source: 'env' | 'kv', active: boolean): void {
  qwenKillSwitchActive.set({ source }, active ? 1 : 0);
}

/** Set L4 paper-gate days remaining (clamped to [0, 30]) */
export function setQwenPaperGateDaysRemaining(days: number): void {
  const clamped = Math.max(0, Math.min(30, Math.round(days * 10) / 10));
  qwenPaperGateDaysRemaining.set(clamped);
}

/** Set L3 drawdown auto-disable state */
export function setQwenDrawdownAutoDisabled(disabled: boolean): void {
  qwenDrawdownAutoDisabled.set(disabled ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Market Data Metrics Recorders
// ═══════════════════════════════════════════════════════════════════════════════

/** Record a data gap event */
export function recordDataGap(exchange: string, symbol: string, gapSeconds: number): void {
  dataGapEvents.inc({ exchange, symbol });
  dataGapDuration.observe(gapSeconds);
}

/** Record gap detection duration */
export function recordGapDetectionDuration(_exchange: string, _symbol: string, durationMs: number): void {
  gapDetectionDuration.observe(durationMs);
}

/** Set expected candle count */
export function setExpectedCandles(_exchange: string, _symbol: string, _timeframe: string, count: number): void {
  expectedCandles.set(count);
}

/** Set received candle count */
export function setReceivedCandles(_exchange: string, _symbol: string, _timeframe: string, count: number): void {
  receivedCandles.set(count);
}

/** Set candle completeness ratio */
export function setCandleCompleteness(_exchange: string, _symbol: string, _timeframe: string, ratio: number): void {
  candleCompleteness.set(ratio);
}

/** Record outlier detection event */
export function recordOutlierEvent(symbol: string, type: string, severity?: string): void {
  outlierEvents.inc({ symbol, type, severity: severity ?? 'unknown' });
}

/** Record outlier Z-score */
export function recordOutlierZScore(symbol: string, _type: string, zScore: number): void {
  outlierZScore.set({ symbol }, zScore);
}

/** Record provider latency */
export function recordProviderLatency(exchange: string, operation: string, latencyMs: number): void {
  providerLatency.observe({ exchange, operation }, latencyMs / 1000);
}

/** Record failover event */
export function recordFailoverEvent(fromProvider: string, toProvider: string, reason: string): void {
  failoverEvents.inc({ from: fromProvider, to: toProvider, reason });
}

/** Set circuit breaker state per provider */
export function setCircuitBreakerStateProvider(exchange: string, isOpen: boolean): void {
  circuitBreakerStateProvider.set({ exchange }, isOpen ? 1 : 0);
}

/** Set provider health score (0-100) */
export function setProviderHealthScore(exchange: string, _windowHours: number, score: number): void {
  providerHealthScore.set({ exchange }, score);
}

/** Set provider availability */
export function setProviderAvailability(exchange: string, _windowHours: number, available: boolean): void {
  providerAvailability.set({ exchange }, available ? 1 : 0);
}

/** Set provider error rate */
export function setProviderErrorRate(exchange: string, _windowHours: number, rate: number): void {
  providerErrorRate.set({ exchange }, rate);
}

/** Record SLA compliance event */
export function recordSlaCompliance(exchange: string, _windowHours: number, compliant: boolean): void {
  slaCompliance.inc({ exchange, compliant: compliant ? 'true' : 'false' });
}
