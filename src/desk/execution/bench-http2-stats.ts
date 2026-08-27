/**
 * HTTP/2 Benchmark — Statistics
 *
 * Pure statistics functions and result types for the connection pool latency
 * benchmark. Extracted from bench-http2.ts.
 */

/** Benchmark statistics result */
export interface BenchmarkStats {
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

/** Benchmark comparison result */
export interface BenchmarkComparison {
  label: string;
  pooled: BenchmarkStats;
  unpooled: BenchmarkStats;
  improvement: number;
}

// ── Statistics ────────────────────────────────────────────────────────────────

export function calculatePercentiles(data: number[], p: number): number {
  const sorted = [...data].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (upper >= sorted.length) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function calculateStats(latencies: number[]): BenchmarkStats {
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const p50 = calculatePercentiles(latencies, 50);
  const p95 = calculatePercentiles(latencies, 95);
  const p99 = calculatePercentiles(latencies, 99);
  return { p50, p95, p99, mean, min, max, count: latencies.length };
}

export function averageStats(statsArray: BenchmarkStats[]): BenchmarkStats {
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

export function calculateImprovement(baseline: BenchmarkStats, pooled: BenchmarkStats): { p50: number; p99: number; mean: number } {
  const pct = (base: number, newVal: number) => ((base - newVal) / base) * 100;
  return {
    p50: pct(baseline.p50, pooled.p50),
    p99: pct(baseline.p99, pooled.p99),
    mean: pct(baseline.mean, pooled.mean),
  };
}
