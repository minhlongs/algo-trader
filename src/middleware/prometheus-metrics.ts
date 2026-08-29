/**
 * Prometheus Metrics Middleware (legacy entry point at src/middleware/).
 * Provides Express-specific helpers and re-exports canonical metrics from
 * platform/middleware/prometheus-metrics for backward compatibility.
 *
 * Migrate imports to `from '../../platform/middleware/prometheus-metrics'`.
 */

import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { setCircuitBreakerState as _setCb } from '../platform/middleware/prometheus-metrics';
import { recordShardLatency as _recShard } from '../platform/middleware/prometheus-metrics';
import { winRatePercent as _winRateGauge } from '../platform/middleware/prometheus-metrics';
import { setStrategyActive as _setStrategyActive } from '../platform/middleware/prometheus-metrics';
import { recordExternalApiLatency as _recExtLat } from '../platform/middleware/prometheus-metrics';
import { qwenSignalsTotal as _qwenSignalsTotal } from '../platform/middleware/prometheus-metrics';
import { logger } from '../shared/utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Own registry for express middleware
// ─────────────────────────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// ─────────────────────────────────────────────────────────────────────────────
// Re-export canonical metrics so callers using old import paths keep working
// ─────────────────────────────────────────────────────────────────────────────
export {
 register as canonicalRegister,
 // Core
 recordDataGap, recordGapDetectionDuration, setExpectedCandles, setReceivedCandles,
 setCandleCompleteness,
 recordOutlierEvent, recordOutlierZScore,
 recordFailoverEvent,
 // setCircuitBreakerState excluded — legacy file wraps with 1-arg signature
 setProviderHealthScore, setProviderAvailability, setProviderErrorRate, recordSlaCompliance,
 recordShardLatency,
 // BullMQ
 recordQueueWaitTime, // External API
 recordExternalApiLatency, externalApiLatency,
 // API middleware
 // Trade
 recordTrade, dailyPnlUsd, winRatePercent,
 // Qwen strategy
 qwenPaperPnlPct, qwenSignalsTotal,
 qwenStrategyReviewsResolvedTotal,
 qwenAdminKillActionsTotal,
 setQwenKillSwitch, setQwenDrawdownAutoDisabled, setQwenPaperGateDaysRemaining,
 qwenStrategyReviewsQueuedTotal, qwenSignalsLoopRunsTotal, qwenSignalsLoopLastRunTs,
 qwenSignalsLoopJournalWriteErrorsTotal, qwenStrategyReviewBacklogSize,
 qwenStrategyReviewOldestPendingAgeSec,
 // Memory
 setMemoryMetrics,
 recordMemoryPressureEvent, recordCacheEviction,
 // Compression
 recordCompressionRatio,
 // Strategy
 setStrategyActive,
} from '../platform/middleware/prometheus-metrics';

// ─────────────────────────────────────────────────────────────────────────────
// Express-specific helpers (not in canonical file)
// ─────────────────────────────────────────────────────────────────────────────

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
 name: 'http_requests_total',
 help: 'Total HTTP requests',
 labelNames: ['method', 'path', 'status'] as const,
 registers: [register],
});

// HTTP request duration histogram
export const httpRequestDuration = new client.Histogram({
 name: 'http_request_duration_seconds',
 help: 'HTTP request duration in seconds',
 labelNames: ['method', 'path'] as const,
 buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
 registers: [register],
});

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
// Legacy helpers — delegate to canonical implementations
// ─────────────────────────────────────────────────────────────────────────────

/** Record a trading signal (legacy — uses qwenSignalsTotal result label) */
export function recordSignal(symbol: string, signalType: 'buy' | 'sell' | 'hold'): void {
 _qwenSignalsTotal.inc({ result: signalType });
}

/** Record exchange API latency (legacy — delegates to externalApiLatency) */
export function recordExchangeLatency(exchange: string, operation: string, latencySeconds: number): void {
 _recExtLat(exchange, operation, 'default', latencySeconds);
}

/** Record trade execution time (legacy — delegates to shard latency) */
export function recordTradeExecutionTime(exchange: string, symbol: string, durationSeconds: number): void {
 _recShard(exchange, symbol, durationSeconds);
}

/** Update win rate (legacy — delegates to winRatePercent gauge) */
export function setWinRate(winRate: number): void {
 _winRateGauge.set({ strategy: 'default' }, winRate);
}

/** Update circuit breaker state (legacy — delegates to canonical setter) */
export function setCircuitBreakerState(isOpen: boolean): void {
 _setCb(isOpen);
}

/** Update open positions count (legacy — delegates to strategyActive gauge) */
export function setOpenPositions(symbol: string, exchange: string, count: number): void {
 _setStrategyActive(`${symbol}:${exchange}`, count > 0);
}

export { register };
