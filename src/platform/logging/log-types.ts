/**
 * Log types, interfaces, and utilities for the Centralized Log Aggregator.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  service: string;
  traceId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LogBackend {
  name: string;
  write(entries: LogEntry[]): Promise<void>;
  close(): Promise<void>;
}

export interface AggregatorConfig {
  serviceName: string;
  minLevel: LogLevel;
  bufferSize: number;
  flushIntervalMs: number;
  backends: LogBackend[];
}

/** Generate a short trace ID for request correlation */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}
