/**
 * In-memory Metrics Collector
 *
 * Tracks request count, latency histogram, error count, and active connections.
 * Uses a 5-minute sliding window for rate calculations.
 * No external dependencies - pure Node.js implementation.
 */

interface RequestRecord {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

interface MetricsSummary {
  requests: {
    total: number;
    perSecond: number;
    perStatus: Record<string, number>;
    perMethod: Record<string, number>;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
  };
  errors: {
    total: number;
    rate: number;
  };
  activeConnections: number;
  uptime: number;
}

const SLIDING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RECORDS = 10000;

class MetricsCollector {
  private requests: RequestRecord[] = [];
  private activeConnections = 0;
  private startTime = Date.now();

  /**
   * Record a completed request
   */
  recordRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number
  ): void {
    const record: RequestRecord = {
      method: method.toUpperCase(),
      path,
      statusCode,
      durationMs,
      timestamp: Date.now(),
    };

    this.requests.push(record);

    // Evict old records beyond sliding window
    this.evictOldRecords();
  }

  /**
   * Increment active connections count
   */
  incrementActiveConnections(): void {
    this.activeConnections++;
  }

  /**
   * Decrement active connections count
   */
  decrementActiveConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  /**
   * Get current metrics summary
   */
  getMetrics(): MetricsSummary {
    this.evictOldRecords();

    const now = Date.now();
    const windowRecords = this.getRecordsInWindow();

    // Calculate request metrics
    const totalRequests = windowRecords.length;
    const windowDurationSec = SLIDING_WINDOW_MS / 1000;
    const requestsPerSecond = totalRequests / windowDurationSec;

    // Count by status code
    const perStatus: Record<string, number> = {};
    const perMethod: Record<string, number> = {};
    const latencies: number[] = [];

    for (const record of windowRecords) {
      const statusKey = `${record.statusCode}`;
      perStatus[statusKey] = (perStatus[statusKey] || 0) + 1;
      perMethod[record.method] = (perMethod[record.method] || 0) + 1;
      latencies.push(record.durationMs);
    }

    // Calculate latency percentiles
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const latency = {
      p50: this.getPercentile(sortedLatencies, 50),
      p95: this.getPercentile(sortedLatencies, 95),
      p99: this.getPercentile(sortedLatencies, 99),
      avg: this.getAverage(latencies),
      min: sortedLatencies.length > 0 ? sortedLatencies[0] : 0,
      max: sortedLatencies.length > 0 ? sortedLatencies[sortedLatencies.length - 1] : 0,
    };

    // Calculate error metrics
    const errorRecords = windowRecords.filter((r) => r.statusCode >= 400);
    const errorRate = totalRequests > 0 ? errorRecords.length / totalRequests : 0;

    return {
      requests: {
        total: totalRequests,
        perSecond: Math.round(requestsPerSecond * 100) / 100,
        perStatus,
        perMethod,
      },
      latency,
      errors: {
        total: errorRecords.length,
        rate: Math.round(errorRate * 10000) / 10000,
      },
      activeConnections: this.activeConnections,
      uptime: Math.floor((now - this.startTime) / 1000),
    };
  }

  /**
   * Get metrics formatted for Prometheus
   */
  getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    lines.push(`# HELP algo_trader_requests_total Total HTTP requests`);
    lines.push(`# TYPE algo_trader_requests_total counter`);
    lines.push(`algo_trader_requests_total ${metrics.requests.total}`);

    lines.push(`# HELP algo_trader_requests_per_second Request rate`);
    lines.push(`# TYPE algo_trader_requests_per_second gauge`);
    lines.push(`algo_trader_requests_per_second ${metrics.requests.perSecond}`);

    lines.push(`# HELP algo_trader_latency_ms Request latency histogram`);
    lines.push(`# TYPE algo_trader_latency_ms summary`);
    lines.push(`algo_trader_latency_ms{quantile="0.5"} ${metrics.latency.p50}`);
    lines.push(`algo_trader_latency_ms{quantile="0.95"} ${metrics.latency.p95}`);
    lines.push(`algo_trader_latency_ms{quantile="0.99"} ${metrics.latency.p99}`);
    lines.push(`algo_trader_latency_ms_sum ${metrics.latency.avg * metrics.requests.total}`);
    lines.push(`algo_trader_latency_ms_count ${metrics.requests.total}`);

    lines.push(`# HELP algo_trader_errors_total Total errors (status >= 400)`);
    lines.push(`# TYPE algo_trader_errors_total counter`);
    lines.push(`algo_trader_errors_total ${metrics.errors.total}`);

    lines.push(`# HELP algo_trader_error_rate Error rate`);
    lines.push(`# TYPE algo_trader_error_rate gauge`);
    lines.push(`algo_trader_error_rate ${metrics.errors.rate}`);

    lines.push(`# HELP algo_trader_active_connections Current active connections`);
    lines.push(`# TYPE algo_trader_active_connections gauge`);
    lines.push(`algo_trader_active_connections ${metrics.activeConnections}`);

    lines.push(`# HELP algo_trader_uptime_seconds Process uptime`);
    lines.push(`# TYPE algo_trader_uptime_seconds gauge`);
    lines.push(`algo_trader_uptime_seconds ${metrics.uptime}`);

    return lines.join('\n');
  }

  private evictOldRecords(): void {
    const cutoff = Date.now() - SLIDING_WINDOW_MS;
    const cutoffIndex = this.requests.findIndex((r) => r.timestamp >= cutoff);

    if (cutoffIndex > 0) {
      this.requests = this.requests.slice(cutoffIndex);
    } else if (cutoffIndex === -1 && this.requests.length > 0) {
      // All records are older than window
      this.requests = [];
    }

    // Also enforce max records limit
    if (this.requests.length > MAX_RECORDS) {
      this.requests = this.requests.slice(this.requests.length - MAX_RECORDS);
    }
  }

  private getRecordsInWindow(): RequestRecord[] {
    const cutoff = Date.now() - SLIDING_WINDOW_MS;
    return this.requests.filter((r) => r.timestamp >= cutoff);
  }

  private getPercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private getAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / values.length) * 100) / 100;
  }
}

// Singleton instance
let instance: MetricsCollector | null = null;

/**
 * Get the singleton MetricsCollector instance
 */
export function getMetricsCollector(): MetricsCollector {
  if (!instance) {
    instance = new MetricsCollector();
  }
  return instance;
}

/**
 * Record a request metric
 */
export function recordRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
): void {
  getMetricsCollector().recordRequest(method, path, statusCode, durationMs);
}

/**
 * Get metrics summary
 */
export function getMetrics(): MetricsSummary {
  return getMetricsCollector().getMetrics();
}

/**
 * Get Prometheus format metrics
 */
export function getPrometheusMetrics(): string {
  return getMetricsCollector().getPrometheusMetrics();
}

/**
 * Track active connections
 */
export function trackConnection(): { end: () => void } {
  getMetricsCollector().incrementActiveConnections();
  return {
    end: () => getMetricsCollector().decrementActiveConnections(),
  };
}

export type { MetricsSummary };
