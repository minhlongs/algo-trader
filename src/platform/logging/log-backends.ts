/**
 * Log Backends for the Centralized Log Aggregator.
 * Includes StdoutBackend, FileBackend, and HttpBackend.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger as baseLogger } from '../../shared/utils/logger';
import type { LogBackend, LogEntry } from './log-types';

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
