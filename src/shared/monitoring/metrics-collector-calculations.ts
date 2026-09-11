/**
 * Metrics Collector Statistical Calculations
 * Pure calculation functions for metrics percentiles, averages, and window summaries.
 */
import {
  RequestRecord,
  MetricsSummary,
  SLIDING_WINDOW_MS,
} from './metrics-collector-types';

export function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export function computeMetricsSummary(
  windowRecords: RequestRecord[],
  activeConnections: number,
  startTime: number,
  now: number,
): MetricsSummary {
  const totalRequests = windowRecords.length;
  const windowDurationSec = SLIDING_WINDOW_MS / 1000;
  const requestsPerSecond = totalRequests / windowDurationSec;

  const perStatus: Record<string, number> = {};
  const perMethod: Record<string, number> = {};
  const latencies: number[] = [];

  for (const record of windowRecords) {
    const statusKey = `${record.statusCode}`;
    perStatus[statusKey] = (perStatus[statusKey] || 0) + 1;
    perMethod[record.method] = (perMethod[record.method] || 0) + 1;
    latencies.push(record.durationMs);
  }

  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const latency = {
    p50: calculatePercentile(sortedLatencies, 50),
    p95: calculatePercentile(sortedLatencies, 95),
    p99: calculatePercentile(sortedLatencies, 99),
    avg: calculateAverage(latencies),
    min: sortedLatencies.length > 0 ? sortedLatencies[0] : 0,
    max: sortedLatencies.length > 0 ? sortedLatencies[sortedLatencies.length - 1] : 0,
  };

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
    activeConnections,
    uptime: Math.floor((now - startTime) / 1000),
  };
}
