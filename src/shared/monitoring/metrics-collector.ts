/**
 * In-memory Metrics Collector
 *
 * Tracks request count, latency histogram, error count, and active connections.
 * Uses a 5-minute sliding window for rate calculations.
 * No external dependencies - pure Node.js implementation.
 */

import type { RequestRecord, MetricsSummary } from './metrics-collector-types';
import { SLIDING_WINDOW_MS, MAX_RECORDS } from './metrics-collector-types';
import { formatPrometheusMetrics } from './metrics-collector-prometheus';
import { computeMetricsSummary } from './metrics-collector-calculations';

export type { MetricsSummary };

export class MetricsCollector {
  private requests: RequestRecord[] = [];
  private activeConnections = 0;
  private startTime = Date.now();

  /** Record a completed request */
  recordRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    const record: RequestRecord = {
      method: method.toUpperCase(),
      path,
      statusCode,
      durationMs,
      timestamp: Date.now(),
    };

    this.requests.push(record);
    this.evictOldRecords();
  }

  /** Increment active connections count */
  incrementActiveConnections(): void {
    this.activeConnections++;
  }

  /** Decrement active connections count */
  decrementActiveConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  /** Get current metrics summary */
  getMetrics(): MetricsSummary {
    this.evictOldRecords();
    const now = Date.now();
    const windowRecords = this.getRecordsInWindow();
    return computeMetricsSummary(windowRecords, this.activeConnections, this.startTime, now);
  }

  /** Get metrics formatted for Prometheus */
  getPrometheusMetrics(): string {
    return formatPrometheusMetrics(this.getMetrics());
  }

  private evictOldRecords(): void {
    const cutoff = Date.now() - SLIDING_WINDOW_MS;
    const cutoffIndex = this.requests.findIndex((r) => r.timestamp >= cutoff);

    if (cutoffIndex > 0) {
      this.requests = this.requests.slice(cutoffIndex);
    } else if (cutoffIndex === -1 && this.requests.length > 0) {
      this.requests = [];
    }

    if (this.requests.length > MAX_RECORDS) {
      this.requests = this.requests.slice(this.requests.length - MAX_RECORDS);
    }
  }

  private getRecordsInWindow(): RequestRecord[] {
    const cutoff = Date.now() - SLIDING_WINDOW_MS;
    return this.requests.filter((r) => r.timestamp >= cutoff);
  }
}

// Singleton instance
let instance: MetricsCollector | null = null;

/** Get the singleton MetricsCollector instance */
export function getMetricsCollector(): MetricsCollector {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

/** Record a request metric */
export function recordRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  getMetricsCollector().recordRequest(method, path, statusCode, durationMs);
}

/** Get metrics summary */
export function getMetrics(): MetricsSummary {
  return getMetricsCollector().getMetrics();
}

/** Get Prometheus format metrics */
export function getPrometheusMetrics(): string {
  return getMetricsCollector().getPrometheusMetrics();
}

/** Track active connections */
export function trackConnection(): { end: () => void } {
  getMetricsCollector().incrementActiveConnections();
  return {
    end: () => getMetricsCollector().decrementActiveConnections(),
  };
}
