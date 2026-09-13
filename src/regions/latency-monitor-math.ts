import type { RegionMetrics, ProbeResult } from './latency-monitor-types';

export function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function computeRegionMetrics(
  region: string,
  regionResults: ProbeResult[],
): RegionMetrics {
  if (regionResults.length === 0) {
    return {
      region,
      latencyP50: 0,
      latencyP95: 0,
      latencyP99: 0,
      healthy: false,
      lastCheck: Date.now(),
      errorRate: 1,
    };
  }

  const latencies = regionResults.map(r => r.latencyMs).sort((a, b) => a - b);
  const errors = regionResults.filter(r => r.status === 'failure').length;
  const errorRate = errors / regionResults.length;

  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);

  return {
    region,
    latencyP50: p50,
    latencyP95: p95,
    latencyP99: p99,
    healthy: errorRate < 0.1 && p95 < 200, // <10% errors, <200ms p95
    lastCheck: Date.now(),
    errorRate,
  };
}

export async function probeRegionEndpoint(url: string, region: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      cf: { cacheTtl: 0 },
    } as RequestInit & { cf: { cacheTtl: number } });

    const latency = Date.now() - start;
    const success = res.status === 200;

    try {
      const mod = await import('../platform/middleware/prometheus-metrics');
      mod.recordExternalApiLatency('probe', region, region, latency / 1000);
    } catch {
      // Prometheus unavailable in Workers runtime -- silently skip
    }

    return {
      region,
      target: url,
      latencyMs: latency,
      status: success ? 'success' : 'failure',
      error: success ? undefined : `HTTP ${res.status}`,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      region,
      target: url,
      latencyMs: Date.now() - start,
      status: 'failure',
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}
