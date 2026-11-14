/**
 * Append-only JSONL writer for point-in-time L2 Polymarket books.
 *
 * Every row carries `source: 'recorded-l2'` (see `l2-source-labels.ts`) so downstream
 * code can tell observed market data apart from retroactive or synthetic series.
 *
 * The recorder serialises writes through a single promise chain: `write` never
 * interleaves partial lines, and `close()` resolves only after every queued row has
 * been flushed and the file descriptor is released.
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeMarketMessage } from './l2-message-normalizer';
import type { RecordedL2Row } from './l2-event-types';

export interface L2RecorderOptions {
  /** Destination JSONL path. Parent directories are created. */
  filePath: string;
  /** Injectable clock, epoch milliseconds. Defaults to `Date.now`. */
  now?: () => number;
}

export interface L2Recorder {
  /** Append already-normalised rows in order. Resolves once they are written to the stream. */
  writeRows(rows: RecordedL2Row[]): Promise<void>;
  /** Normalise a raw WebSocket frame and append the resulting rows. Returns how many were written. */
  recordRawMessage(raw: string): Promise<number>;
  /** Rows appended so far. */
  readonly rowCount: number;
  /** Flush and release the file descriptor. Safe to call more than once. */
  close(): Promise<void>;
}

export function createL2Recorder(options: L2RecorderOptions): L2Recorder {
  const { filePath, now = Date.now } = options;
  mkdirSync(dirname(filePath), { recursive: true });

  const stream: WriteStream = createWriteStream(filePath, { flags: 'a', encoding: 'utf8' });
  let queue: Promise<void> = Promise.resolve();
  let rowCount = 0;
  let closed = false;
  // Surfaced on the next write/close instead of swallowed, so an unwritable path throws.
  let streamError: Error | null = null;

  stream.on('error', (err: Error) => {
    streamError = err;
  });

  function append(rows: RecordedL2Row[]): Promise<void> {
    if (closed) return Promise.reject(new Error('L2 recorder is already closed'));
    if (streamError) return Promise.reject(streamError);
    if (rows.length === 0) return queue;

    const payload = rows.map((row) => `${JSON.stringify(row)}\n`).join('');
    queue = queue.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (streamError) {
            reject(streamError);
            return;
          }
          stream.write(payload, 'utf8', (err) => (err ? reject(err) : resolve()));
        }),
    );
    rowCount += rows.length;
    return queue;
  }

  return {
    get rowCount() {
      return rowCount;
    },
    writeRows(rows: RecordedL2Row[]): Promise<void> {
      return append(rows);
    },
    recordRawMessage(raw: string): Promise<number> {
      const rows = normalizeMarketMessage(raw, now());
      return append(rows).then(() => rows.length);
    },
    close(): Promise<void> {
      if (closed) return queue;
      closed = true;
      queue = queue.then(
        () =>
          new Promise<void>((resolve, reject) => {
            if (streamError) {
              reject(streamError);
              return;
            }
            stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
          }),
      );
      return queue;
    },
  };
}
