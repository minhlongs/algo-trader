/**
 * HTTP/2 Benchmark — Formatting & Session Helpers
 *
 * Extracted formatting, aggregation, and mock session patching helpers
 * for bench-http2.ts.
 */

import type { Http2ConnectionPool } from './http2-connection-pool';
import {
  CONNECT_DELAY_MS,
  ITERATIONS,
  REQUEST_LATENCY_MS,
  REQUESTS_PER_TEST,
  MockHttp2Session,
} from './bench-http2-mock';
import {
  type BenchmarkStats,
  averageStats,
  calculateImprovement,
} from './bench-http2-stats';

export interface BenchmarkIteration {
  baseline: { sequential: BenchmarkStats; concurrent: BenchmarkStats };
  pooled: { sequential: BenchmarkStats; concurrent: BenchmarkStats };
}

export function patchPoolWithMockSession(pool: Http2ConnectionPool): void {
  const patchedCreateSession = async function (
    this: Http2ConnectionPool,
    origin: string,
    _ip: string,
  ) {
    const session = new MockHttp2Session(origin);
    const info = {
      session,
      origin,
      inUse: 1,
      lastUsed: Date.now(),
    };
    const sessions =
      (this as unknown as { sessions: Map<string, typeof info[]> }).sessions.get(origin) || [];
    sessions.push(info);
    (this as unknown as { sessions: Map<string, typeof info[]> }).sessions.set(origin, sessions);
    return info;
  };
  (pool as unknown as { createSession: typeof patchedCreateSession }).createSession =
    patchedCreateSession;
}

export function formatStat(s: BenchmarkStats): string {
  return `p50=${s.p50.toFixed(2)}ms, p99=${s.p99.toFixed(2)}ms, mean=${s.mean.toFixed(2)}ms`;
}

export function formatBenchmarkReport(aggregatedResults: BenchmarkIteration[]): string {
  const avgBaselineSeq = averageStats(aggregatedResults.map((r) => r.baseline.sequential));
  const avgBaselineConc = averageStats(aggregatedResults.map((r) => r.baseline.concurrent));
  const avgPooledSeq = averageStats(aggregatedResults.map((r) => r.pooled.sequential));
  const avgPooledConc = averageStats(aggregatedResults.map((r) => r.pooled.concurrent));

  const seqImp = calculateImprovement(avgBaselineSeq, avgPooledSeq);
  const concImp = calculateImprovement(avgBaselineConc, avgPooledConc);

  const lines: string[] = [
    'HTTP/2 Connection Pool Latency Benchmark',
    '=======================================',
    '',
    'Configuration:',
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

  return lines.join('\n');
}
