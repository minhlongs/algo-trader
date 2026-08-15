/**
 * HTTP/2 Connection Pool Latency Benchmark
 *
 * Compares connection pooling vs no pooling using mocked HTTP/2 sessions.
 * Measures sequential and concurrent request latency percentiles.
 *
 * Run: npx ts-node src/execution/bench-http2.ts
 */

import { performance } from 'node:perf_hooks';
import { promises as fs } from 'node:fs';
import { EventEmitter } from 'node:events';
import { Http2ConnectionPool } from './http2-connection-pool';
import { logger } from '../../shared/utils/logger';

/** Mock HTTP/2 session options */
interface MockSessionOptions {
  [key: string]: unknown;
}

/** Mock HTTP/2 request options */
interface MockRequestOptions {
  [key: string]: unknown;
}

/** Mock HTTP/2 response headers */
interface MockResponseHeaders {
  ':status': number;
  [key: string]: string | number;
}

/** Benchmark statistics result */
interface BenchmarkStats {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

/** Benchmark comparison result */
interface BenchmarkComparison {
  label: string;
  pooled: BenchmarkStats;
  unpooled: BenchmarkStats;
  improvement: number;
}

// ── Mock Configuration ───────────────────────────────────────────────────────

const CONNECT_DELAY_MS = 2;
const REQUEST_LATENCY_MS = 0.5;
const POOL_MAX_CONNECTIONS = 100;
const WARM_CONNECTIONS = 100;
const REQUESTS_PER_TEST = 100;
const ITERATIONS = 3;
const TEST_URL = 'https://localhost:34567';

// ── Mock HTTP/2 Session ───────────────────────────────────────────────────────

class MockHttp2Session extends EventEmitter {
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
interface MockHttp2Stream extends EventEmitter {
  write: (data: Buffer) => void;
  end: () => void;
}

// ── Simple HTTP/2 Adapter ─────────────────────────────────────────────────────

class SimpleHttp2Adapter {
  private readonly baseUrl: string;
  private readonly http2Pool: Http2ConnectionPool | null;
  private readonly usePool: boolean;

  constructor(baseUrl: string, usePool: boolean, pool?: Http2ConnectionPool) {
    this.baseUrl = baseUrl;
    this.usePool = usePool;
    this.http2Pool = pool || null;
  }

  async request(): Promise<void> {
    const url = `${this.baseUrl}/test`;

    if (this.usePool && this.http2Pool) {
      const session = await this.http2Pool.getSession(url);
      try {
        await this.makeRequest(session as unknown as MockHttp2Session);
      } finally {
        this.http2Pool.releaseSession(url, session);
      }
    } else {
      const session = await this.createDirectSession(url);
      try {
        await this.makeRequest(session);
      } finally {
        session.close();
      }
    }
  }

  private async makeRequest(session: MockHttp2Session): Promise<void> {
    return new Promise((resolve, reject) => {
      const reqStream = session.request({
        ':method': 'GET',
        ':path': '/test',
      });

      let data = '';

      reqStream.on('response', (headers: MockResponseHeaders) => {
        const status = headers[':status'] as number;
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
      });

      reqStream.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });

      reqStream.on('end', () => {
        try {
          JSON.parse(data);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      reqStream.on('error', reject);
      reqStream.end();
    });
  }

  private async createDirectSession(url: string): Promise<MockHttp2Session> {
    const origin = this.extractOrigin(url);
    return new MockHttp2Session(origin);
  }

  private extractOrigin(url: string): string {
    const urlObj = new URL(url);
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    return `${urlObj.protocol}//${urlObj.hostname}:${port}`;
  }
}

// ── Statistics ────────────────────────────────────────────────────────────────

function calculatePercentiles(data: number[], p: number): number {
  const sorted = [...data].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sorted.length) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function calculateStats(latencies: number[]): BenchmarkStats {
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const p50 = calculatePercentiles(latencies, 50);
  const p95 = calculatePercentiles(latencies, 95);
  const p99 = calculatePercentiles(latencies, 99);
  return { p50, p95, p99, mean, min, max, count: latencies.length };
}

function averageStats(statsArray: BenchmarkStats[]): BenchmarkStats {
  const avg = (field: keyof BenchmarkStats) =>
    statsArray.reduce((sum, s) => sum + (s[field] as number), 0) / statsArray.length;
  return {
    p50: avg('p50'),
    p95: avg('p95'),
    p99: avg('p99'),
    mean: avg('mean'),
    min: avg('min'),
    max: avg('max'),
    count: statsArray[0].count,
  };
}

function calculateImprovement(baseline: BenchmarkStats, pooled: BenchmarkStats): { p50: number; p99: number; mean: number } {
  const pct = (base: number, newVal: number) => ((base - newVal) / base) * 100;
  return {
    p50: pct(baseline.p50, pooled.p50),
    p99: pct(baseline.p99, pooled.p99),
    mean: pct(baseline.mean, pooled.mean),
  };
}

// ── Benchmark Runners ─────────────────────────────────────────────────────────

async function runSequentialBenchmark(
  adapter: SimpleHttp2Adapter,
  iterations: number = REQUESTS_PER_TEST
): Promise<BenchmarkStats> {
  const latencies: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await adapter.request();
    latencies.push(performance.now() - start);
  }
  return calculateStats(latencies);
}

async function runConcurrentBenchmark(
  adapter: SimpleHttp2Adapter,
  batchSize: number = REQUESTS_PER_TEST
): Promise<BenchmarkStats> {
  const startTimes: number[] = new Array(batchSize);
  const promises = Array.from({ length: batchSize }, async (_, idx) => {
    startTimes[idx] = performance.now();
    await adapter.request();
    return performance.now() - startTimes[idx];
  });
  const latencies = await Promise.all(promises);
  return calculateStats(latencies);
}

// ── Main Runner ───────────────────────────────────────────────────────────────

async function runBenchmarks(): Promise<void> {
  logger.info('Starting HTTP/2 Connection Pool Latency Benchmark\n');

  const resultsDir = '/Users/macbook/algo-trader/plans/20260617-1430-differentiation-quick-wins';
  const resultsFile = `${resultsDir}/benchmark-http2-results.txt`;
  await fs.mkdir(resultsDir, { recursive: true });

  process.env.POLY_MAX_CONNECTIONS = String(POOL_MAX_CONNECTIONS);

  // Get singleton pool
  const pool = Http2ConnectionPool.getInstance();

  // Patch pool's createSession to use MockHttp2Session instead of real http2.connect
  const patchedCreateSession = async function (this: Http2ConnectionPool, origin: string, _ip: string) {
    const session = new MockHttp2Session(origin);
    const info = {
      session,
      origin,
      inUse: 1,
      lastUsed: Date.now(),
    };
    const sessions = (this as unknown as { sessions: Map<string, typeof info[]> }).sessions.get(origin) || [];
    sessions.push(info);
    (this as unknown as { sessions: Map<string, typeof info[]> }).sessions.set(origin, sessions);
    return info;
  };
  (pool as unknown as { createSession: typeof patchedCreateSession }).createSession = patchedCreateSession;

  logger.info(`Warming up ${WARM_CONNECTIONS} connections...`);
  await pool.warmConnections(TEST_URL, WARM_CONNECTIONS);
  logger.info('Pool warmed.\n');

  const pooledAdapter = new SimpleHttp2Adapter(TEST_URL, true, pool);
  const baselineAdapter = new SimpleHttp2Adapter(TEST_URL, false);

  interface BenchmarkIteration {
    baseline: { sequential: BenchmarkStats; concurrent: BenchmarkStats };
    pooled: { sequential: BenchmarkStats; concurrent: BenchmarkStats };
  }

  const aggregatedResults: BenchmarkIteration[] = [];

  logger.info(`Running ${ITERATIONS} iterations...\n`);

  for (let i = 0; i < ITERATIONS; i++) {
    logger.info(`Iteration ${i + 1}/${ITERATIONS}:`);

    logger.info('  Baseline (no pool) - Sequential...');
    const baselineSeq = await runSequentialBenchmark(baselineAdapter);

    logger.info('  Baseline (no pool) - Concurrent...');
    const baselineConc = await runConcurrentBenchmark(baselineAdapter);

    logger.info('  HTTP/2 Pool - Sequential...');
    const pooledSeq = await runSequentialBenchmark(pooledAdapter);

    logger.info('  HTTP/2 Pool - Concurrent...');
    const pooledConc = await runConcurrentBenchmark(pooledAdapter);

    aggregatedResults.push({
      baseline: { sequential: baselineSeq, concurrent: baselineConc },
      pooled: { sequential: pooledSeq, concurrent: pooledConc },
    });

    logger.info(`  Complete.\n`);
  }

  const avgBaselineSeq = averageStats(aggregatedResults.map(r => r.baseline.sequential));
  const avgBaselineConc = averageStats(aggregatedResults.map(r => r.baseline.concurrent));
  const avgPooledSeq = averageStats(aggregatedResults.map(r => r.pooled.sequential));
  const avgPooledConc = averageStats(aggregatedResults.map(r => r.pooled.concurrent));

  const seqImp = calculateImprovement(avgBaselineSeq, avgPooledSeq);
  const concImp = calculateImprovement(avgBaselineConc, avgPooledConc);

  const formatStat = (s: BenchmarkStats) =>
    `p50=${s.p50.toFixed(2)}ms, p99=${s.p99.toFixed(2)}ms, mean=${s.mean.toFixed(2)}ms`;

  const lines: string[] = [
    'HTTP/2 Connection Pool Latency Benchmark',
    '=======================================',
    '',
    `Configuration:`,
    `  Requests per test: ${REQUESTS_PER_TEST}`,
    `  Iterations: ${ITERATIONS}`,
    `  Connect delay: ${CONNECT_DELAY_MS}ms`,
    `  Request latency: ${REQUEST_LATENCY_MS}ms`,
    '',
    'Baseline (no pool):',
    `  Sequential: ${formatStat(avgBaselineSeq)}`,
    `  Concurrent:  ${formatStat(avgBaselineConc)}`,
    '',
    'HTTP/2 Pool:',
    `  Sequential: ${formatStat(avgPooledSeq)}`,
    `  Concurrent:  ${formatStat(avgPooledConc)}`,
    '',
    'Improvement:',
    `  Sequential p50: ${seqImp.p50.toFixed(1)}%`,
    `  Sequential p99: ${seqImp.p99.toFixed(1)}%`,
    `  Sequential mean: ${seqImp.mean.toFixed(1)}%`,
    `  Concurrent p50:  ${concImp.p50.toFixed(1)}%`,
    `  Concurrent p99:  ${concImp.p99.toFixed(1)}%`,
    `  Concurrent mean:  ${concImp.mean.toFixed(1)}%`,
    '',
    'Conclusion:',
    `  ${seqImp.p50 >= 30 ? '✓' : '✗'} p50 sequential improvement ${seqImp.p50.toFixed(1)}% ${seqImp.p50 >= 30 ? 'meets' : 'below'} 30% target`,
  ];

  const output = lines.join('\n');
  logger.info('\n' + output);
  await fs.writeFile(resultsFile, output, 'utf-8');
  logger.info(`\nResults saved to: ${resultsFile}`);

  await pool.shutdown();
}

// ── Entry Point ───────────────────────────────────────────────────────────────

process.env.POLY_MAX_CONNECTIONS = String(POOL_MAX_CONNECTIONS);
runBenchmarks().catch(err => {
  logger.error('Benchmark failed:', err);
  process.exit(1);
});
