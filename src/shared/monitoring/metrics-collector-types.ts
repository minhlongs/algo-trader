/**
 * In-memory Metrics Collector Types and Constants
 */

export interface RequestRecord {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

export interface MetricsSummary {
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

export const SLIDING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_RECORDS = 10000;
