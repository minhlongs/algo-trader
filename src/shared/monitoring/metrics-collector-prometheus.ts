/**
 * Prometheus Metric Formatter
 * Formats metrics summary into Prometheus text exposition format.
 */
import type { MetricsSummary } from './metrics-collector-types';

export function formatPrometheusMetrics(metrics: MetricsSummary): string {
  const lines: string[] = [];

  lines.push('# HELP algo_trader_requests_total Total HTTP requests');
  lines.push('# TYPE algo_trader_requests_total counter');
  lines.push(`algo_trader_requests_total ${metrics.requests.total}`);

  lines.push('# HELP algo_trader_requests_per_second Request rate');
  lines.push('# TYPE algo_trader_requests_per_second gauge');
  lines.push(`algo_trader_requests_per_second ${metrics.requests.perSecond}`);

  lines.push('# HELP algo_trader_latency_ms Request latency histogram');
  lines.push('# TYPE algo_trader_latency_ms summary');
  lines.push(`algo_trader_latency_ms{quantile="0.5"} ${metrics.latency.p50}`);
  lines.push(`algo_trader_latency_ms{quantile="0.95"} ${metrics.latency.p95}`);
  lines.push(`algo_trader_latency_ms{quantile="0.99"} ${metrics.latency.p99}`);
  lines.push(`algo_trader_latency_ms_sum ${metrics.latency.avg * metrics.requests.total}`);
  lines.push(`algo_trader_latency_ms_count ${metrics.requests.total}`);

  lines.push('# HELP algo_trader_errors_total Total errors (status >= 400)');
  lines.push('# TYPE algo_trader_errors_total counter');
  lines.push(`algo_trader_errors_total ${metrics.errors.total}`);

  lines.push('# HELP algo_trader_error_rate Error rate');
  lines.push('# TYPE algo_trader_error_rate gauge');
  lines.push(`algo_trader_error_rate ${metrics.errors.rate}`);

  lines.push('# HELP algo_trader_active_connections Current active connections');
  lines.push('# TYPE algo_trader_active_connections gauge');
  lines.push(`algo_trader_active_connections ${metrics.activeConnections}`);

  lines.push('# HELP algo_trader_uptime_seconds Process uptime');
  lines.push('# TYPE algo_trader_uptime_seconds gauge');
  lines.push(`algo_trader_uptime_seconds ${metrics.uptime}`);

  return lines.join('\n');
}
