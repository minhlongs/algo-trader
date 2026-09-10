/**
 * Prometheus Metrics — Express middleware and route handlers
 *
 * Metric definitions live in prometheus-registry.ts.
 * Helper functions extracted into submodules for file-size compliance.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../shared/utils/logger';
import { annotateActiveSpanWithRegion } from '../../shared/utils/tracing';
import { register, httpRequestDuration } from './prometheus-registry';

// Re-export everything from registry and submodule helpers for backward compatibility
export * from './prometheus-registry';
export * from './prometheus-metrics-data-quality-helpers';
export * from './prometheus-metrics-trading-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Region-aware HTTP Request Tracking
// ─────────────────────────────────────────────────────────────────────────────

function getRegionFromRequest(req: Request): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headers = req.headers as any;
    return headers.get?.('cf-colo') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Metrics tracking middleware with region context.
 * Records HTTP request duration to Prometheus with region and status labels.
 * Also annotates OpenTelemetry spans with region.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const region = getRegionFromRequest(req);
  const route = req.route?.path || req.path;
  const method = req.method;

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
 * Express handler for /metrics endpoint.
 * Returns all metrics in Prometheus format.
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

// Export registry for custom metrics
export { register };
