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

    // Auto-flush on interval
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => { /* swallow */ });
    }, this.config.flushIntervalMs);
  }

  /** Check if a level should be logged */
  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.minLevel];
  }

  /** Create a structured log entry */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    traceId?: string,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: this.config.serviceName,
    };

    if (traceId) entry.traceId = traceId;
    if (context && Object.keys(context).length > 0) entry.context = context;
    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /** Add a log entry and flush if buffer is full */
  private async addEntry(entry: LogEntry): Promise<void> {
    if (this.closed || !this.shouldLog(entry.level)) return;

    this.buffer.push(entry);

    if (this.buffer.length >= this.config.bufferSize) {
      await this.flush();
    }
  }

  /** Flush buffered entries to all backends */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0, this.buffer.length);

    await Promise.allSettled(
      this.config.backends.map((backend) => backend.write(entries))
    );
  }

  /** Log at debug level */
  debug(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.addEntry(this.createEntry('debug', message, context, traceId)).catch(() => {});
  }

  /** Log at info level */
  info(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.addEntry(this.createEntry('info', message, context, traceId)).catch(() => {});
  }

  /** Log at warn level */
  warn(message: string, context?: Record<string, unknown>, traceId?: string): void {
    this.addEntry(this.createEntry('warn', message, context, traceId)).catch(() => {});
  }

  /** Log at error level */
  error(
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    traceId?: string
  ): void {
    this.addEntry(this.createEntry('error', message, context, traceId, error)).catch(() => {});
  }

  /** Log at critical level */
  critical(
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    traceId?: string
  ): void {
    this.addEntry(this.createEntry('critical', message, context, traceId, error)).catch(() => {});
  }

  /** Create a child logger with bound context and optional trace ID */
  child(context: Record<string, unknown>, traceId?: string): ChildLogger {
    return new ChildLogger(this, context, traceId);
  }

  /** Shutdown: flush remaining logs and close backends */
  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    await Promise.allSettled(
      this.config.backends.map((backend) => backend.close())
    );
  }
}
