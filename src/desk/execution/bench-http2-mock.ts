/**
 * HTTP/2 Benchmark — Mock HTTP/2 Session & Config
 *
 * Mocked HTTP/2 session, stream, and benchmark configuration constants used
 * by the connection pool latency benchmark. Extracted from bench-http2.ts.
 */

import { EventEmitter } from 'node:events';

/** Mock HTTP/2 session options */
export interface MockSessionOptions {
  [key: string]: unknown;
}

/** Mock HTTP/2 request options */
export interface MockRequestOptions {
  [key: string]: unknown;
}

/** Mock HTTP/2 response headers */
export interface MockResponseHeaders {
  ':status': number;
  [key: string]: string | number;
}

// ── Mock Configuration ───────────────────────────────────────────────────────

export const CONNECT_DELAY_MS = 2;
export const REQUEST_LATENCY_MS = 0.5;
export const POOL_MAX_CONNECTIONS = 100;
export const WARM_CONNECTIONS = 100;
export const REQUESTS_PER_TEST = 100;
export const ITERATIONS = 3;
export const TEST_URL = 'https://localhost:34567';

// ── Mock HTTP/2 Session ───────────────────────────────────────────────────────

export class MockHttp2Session extends EventEmitter {
  private connectResolve!: () => void;
  public connectPromise: Promise<void>;
  private closed = false;

  constructor(_origin: string, _options?: MockSessionOptions) {
    super();
    this.connectPromise = new Promise(resolve => {
      this.connectResolve = resolve;
    });
    setTimeout(() => {
      this.connectResolve();
      this.emit('connect');
    }, CONNECT_DELAY_MS);
  }

  request(_options: MockRequestOptions): MockHttp2Stream {
    const stream = new EventEmitter() as MockHttp2Stream;
    this.emit('stream', stream);

    this.connectPromise.then(() => {
      setTimeout(() => {
        if (this.closed) {
          stream.emit('error', new Error('Session closed'));
          return;
        }
        stream.emit('response', { ':status': 200 });
        stream.emit('data', JSON.stringify({ status: 'ok' }));
        stream.emit('end');
      }, REQUEST_LATENCY_MS);
    });

    stream.write = (_data: Buffer) => {};
    stream.end = () => {};
    return stream;
  }

  close(cb?: () => void) {
    this.closed = true;
    if (cb) process.nextTick(cb);
    this.emit('close');
  }

  ping(cb: (err: Error | null) => void) {
    this.connectPromise.then(() => {
      if (this.closed) cb(new Error('Session closed'));
      else process.nextTick(() => cb(null));
    });
  }
}

/** Mock HTTP/2 stream */
export interface MockHttp2Stream extends EventEmitter {
  write: (data: Buffer) => void;
  end: () => void;
}
