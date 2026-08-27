/**
 * HTTP/2 Connection Pool Latency Benchmark
 *
 * Compares connection pooling vs no pooling using mocked HTTP/2 sessions.
 * Measures sequential and concurrent request latency percentiles.
 *
 * Run: npx ts-node src/desk/execution/bench-http2.ts
 */

import { performance } from 'node:perf_hooks';
import { promises as fs } from 'node:fs';
import { Http2ConnectionPool } from './http2-connection-pool';
import { logger } from '../../shared/utils/logger';
import {
  CONNECT_DELAY_MS,
  ITERATIONS,
  POOL_MAX_CONNECTIONS,
  REQUEST_LATENCY_MS,
  REQUESTS_PER_TEST,
  TEST_URL,
  WARM_CONNECTIONS,
  MockHttp2Session,
} from './bench-http2-mock';
import {
  BenchmarkStats,
  averageStats,
  calculateImprovement,
  calculateStats,
} from './bench-http2-stats';
import { SimpleHttp2Adapter } from './bench-http2-adapter';

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
