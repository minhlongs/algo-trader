/**
 * Centralized Log Aggregator
 * Structured JSON logging with batching, trace IDs, and configurable backends.
 *
 * Backends: stdout (default), file, HTTP endpoint (Loki, etc.)
 * Buffer and flush on interval or when buffer is full.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger as baseLogger } from '../../shared/utils/logger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
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

/** Stdout backend — writes JSON lines to stdout */
export class StdoutBackend implements LogBackend {
  name = 'stdout';

  async write(entries: LogEntry[]): Promise<void> {
    for (const entry of entries) {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  }

  async close(): Promise<void> { /* no-op */ }
}

/** File backend — writes to a log file with basic rotation */
export class FileBackend implements LogBackend {
  name: string;
  private stream: fs.WriteStream | null = null;
  private readonly filePath: string;
  private readonly maxSizeBytes: number;
  private currentSize = 0;

  constructor(filePath: string, maxSizeBytes = 50 * 1024 * 1024) {
    this.name = `file:${filePath}`;
    this.filePath = filePath;
    this.maxSizeBytes = maxSizeBytes;

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.stream = fs.createWriteStream(filePath, { flags: 'a' });
  }

  async write(entries: LogEntry[]): Promise<void> {
    if (!this.stream) return;

    for (const entry of entries) {
      const line = JSON.stringify(entry) + '\n';
      this.stream.write(line);
      this.currentSize += Buffer.byteLength(line);

      // Rotate if over size limit
      if (this.currentSize >= this.maxSizeBytes) {
        this.rotate();
      }
    }
  }

  private rotate(): void {
    if (this.stream) {
      this.stream.end();
    }
    const rotated = `${this.filePath}.${Date.now()}`;
    try {
      fs.renameSync(this.filePath, rotated);
    } catch { /* file may not exist yet */ }
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    this.currentSize = 0;
  }

  async close(): Promise<void> {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }
}

/** HTTP backend — batches and sends log entries to an HTTP endpoint (e.g., Loki push API) */
export class HttpBackend implements LogBackend {
  name: string;
  private buffer: LogEntry[] = [];

  constructor(
    private readonly endpointUrl: string,
    private readonly batchSize = 100,
    private readonly timeoutMs = 5000
  ) {
    this.name = `http:${endpointUrl}`;
  }

  async write(entries: LogEntry[]): Promise<void> {
    this.buffer.push(...entries);

    while (this.buffer.length >= this.batchSize) {
      const batch = this.buffer.splice(0, this.batchSize);
      await this.sendBatch(batch);
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.buffer.length);
      await this.sendBatch(batch);
    }
  }

  private async sendBatch(batch: LogEntry[]): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streams: batch }),
        signal: controller.signal,
      });

      clearTimeout(timer);
    } catch (err) {
      // Fallback: write failed batch to stderr so it's not lost
      baseLogger.error('[LogAggregator] HTTP backend send failed', {
        endpoint: this.endpointUrl,
        count: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }
}

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

/**
 * Child logger with pre-bound context and trace ID.
 * All log calls inherit the parent's context.
 */
export class ChildLogger {
  constructor(
    private readonly parent: LogAggregator,
    private readonly boundContext: Record<string, unknown>,
    private readonly traceId?: string
  ) {}

  private mergeContext(context?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.boundContext, ...context };
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.parent.debug(message, this.mergeContext(context), this.traceId);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.parent.info(message, this.mergeContext(context), this.traceId);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.parent.warn(message, this.mergeContext(context), this.traceId);
  }

  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.parent.error(message, this.mergeContext(context), error, this.traceId);
  }

  critical(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.parent.critical(message, this.mergeContext(context), error, this.traceId);
  }
}

/** Generate a short trace ID for request correlation */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}
