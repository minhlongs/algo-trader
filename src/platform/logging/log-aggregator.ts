/**
 * Centralized Log Aggregator
 * Structured JSON logging with batching, trace IDs, and configurable backends.
 *
 * Backends: stdout (default), file, HTTP endpoint (Loki, etc.)
 * Buffer and flush on interval or when buffer is full.
 */

import {
  type LogLevel,
  LEVEL_PRIORITY,
  type LogEntry,
  type LogBackend,
  type AggregatorConfig,
  shouldLogLevel,
  buildLogEntry,
} from './log-types';
import { StdoutBackend } from './log-backends';
import { ChildLogger } from './child-logger';

// Re-export public types, constants, utilities, and backends for backward compatibility
export {
  type LogLevel,
  LEVEL_PRIORITY,
  type LogEntry,
  type LogBackend,
  type AggregatorConfig,
  generateTraceId,
  shouldLogLevel,
  buildLogEntry,
} from './log-types';
export { StdoutBackend, FileBackend, HttpBackend } from './log-backends';
export { ChildLogger } from './child-logger';

/**
 * Centralized log aggregator.
 * Buffers log entries and flushes them to configured backends in batches.
 */
export class LogAggregator {
  private buffer: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: AggregatorConfig;
  private closed = false;

  constructor(config?: Partial<AggregatorConfig> & { backends?: LogBackend[] }) {
    this.config = {
      serviceName: config?.serviceName ?? process.env.SERVICE_NAME ?? 'algo-trader',
      minLevel: config?.minLevel ?? 'info',
      bufferSize: config?.bufferSize ?? 200,
      flushIntervalMs: config?.flushIntervalMs ?? 5000,
      backends: config?.backends ?? [new StdoutBackend()],
    };

    this.flushTimer = setInterval(() => {
      this.flush().catch(() => { /* swallow */ });
    }, this.config.flushIntervalMs);
  }

  private shouldLog(level: LogLevel): boolean {
    return shouldLogLevel(level, this.config.minLevel);
  }

  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    traceId?: string,
    error?: Error,
  ): LogEntry {
    return buildLogEntry(this.config.serviceName, level, message, context, traceId, error);
  }

  private async addEntry(entry: LogEntry): Promise<void> {
    if (this.closed || !this.shouldLog(entry.level)) return;
    this.buffer.push(entry);
    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const entries = this.buffer.splice(0, this.buffer.length);
    await Promise.allSettled(this.config.backends.map((backend) => backend.write(entries)));
  }

  debug(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.addEntry(this.createEntry('debug', message, context, traceId)).catch(() => {});
  }

  info(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.addEntry(this.createEntry('info', message, context, traceId)).catch(() => {});
  }

  warn(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.addEntry(this.createEntry('warn', message, context, traceId)).catch(() => {});
  }

  error(message: string, context?: Record<string, unknown>, error?: Error, traceId?: string): void {
    this.addEntry(this.createEntry('error', message, context, traceId, error)).catch(() => {});
  }

  critical(message: string, context?: Record<string, unknown>, error?: Error, traceId?: string): void {
    this.addEntry(this.createEntry('critical', message, context, traceId, error)).catch(() => {});
  }

  child(context: Record<string, unknown>, traceId?: string): ChildLogger {
    return new ChildLogger(this, context, traceId);
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
    await Promise.allSettled(this.config.backends.map((backend) => backend.close()));
  }
}
