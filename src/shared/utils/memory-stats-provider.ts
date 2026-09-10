/**
 * Memory Stats Provider & Metric Exporter
 *
 * Provides runtime memory metric extraction across Cloudflare Workers and Node.js
 * environments, and handles periodic Prometheus metric updates.
 */

import { logger } from './logger';
import { setMemoryMetrics } from '../observability/prometheus-metrics';
import {
  MemoryMetrics,
  PerformanceMemory,
  PressureLevel,
  DEFAULT_MEMORY_LIMIT_BYTES,
} from './memory-pressure-types';

/**
 * Extract memory metrics from runtime environment (performance.memory or process.memoryUsage)
 */
export function extractMemoryMetrics(): MemoryMetrics {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const mem = (performance as unknown as { memory: PerformanceMemory }).memory;
    return {
      rss: mem.rss || 0,
      heapUsed: mem.usedJSHeapSize || 0,
      heapTotal: mem.totalJSHeapSize || 0,
      external: mem.external || 0,
      limit: DEFAULT_MEMORY_LIMIT_BYTES, // Cloudflare Worker limit
    };
  }

  // Non-Worker environment (Node.js for testing)
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const mem = process.memoryUsage();
    return {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external || 0,
      limit: DEFAULT_MEMORY_LIMIT_BYTES,
    };
  }

  return {
    rss: 0,
    heapUsed: 0,
    heapTotal: 0,
    external: 0,
    limit: DEFAULT_MEMORY_LIMIT_BYTES,
  };
}

/**
 * Export metrics to Prometheus and log summary periodically
 */
export function exportMetricsToPrometheus(
  metrics: MemoryMetrics,
  pressureLevel: PressureLevel,
  historyCount: number,
): void {
  const usedMb = metrics.rss / 1024 / 1024;
  const heapMb = metrics.heapUsed / 1024 / 1024;
  const utilization = metrics.rss / metrics.limit;

  // Update Prometheus gauges
  setMemoryMetrics(metrics.rss, metrics.heapUsed);

  // Log summary periodically (every 10th check to avoid spam)
  if (historyCount % 10 === 0) {
    logger.info('[MemoryPressure] Metrics', {
      rssMb: usedMb.toFixed(1),
      heapMb: heapMb.toFixed(1),
      utilizationPct: (utilization * 100).toFixed(1),
      level: pressureLevel,
    });
  }
}
