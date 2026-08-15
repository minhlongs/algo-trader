/**
 * Multi-Region Latency Monitor
 * Probes regional endpoints and tracks health metrics
 * Also integrates with Prometheus for observability
 */

import { logger } from '../utils/logger';

export interface RegionMetrics {
  region: string;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  healthy: boolean;
  lastCheck: number;
  errorRate: number;
}

export interface ProbeResult {
  region: string;
  target: string;
  latencyMs: number;
  status: 'success' | 'failure';
  error?: string;
  timestamp: number;
}

class LatencyMonitor {
  private regions: string[];
  private targetUrl: (region: string) => string;
  private probeInterval: number;
  private results: ProbeResult[] = [];
  private maxResults = 1000;
  private regionHealth: Map<string, RegionMetrics> = new Map();
  private alertThresholdP95: number; // ms
  private alertCallback?: (region: string, p95: number) => void;
  private stopInterval?: () => void;

  constructor(
    regions: string[],
    options: {
      targetUrl?: (region: string) => string;
      probeInterval?: number;
      alertThresholdP95?: number;
      onAlert?: (region: string, p95: number) => void;
    } = {}
  ) {
    this.regions = regions;
    this.targetUrl = options.targetUrl || ((region) => `https://${region}.algo-trader.workers.dev/api/health`);
    this.probeInterval = options.probeInterval || 30000; // 30s
    this.alertThresholdP95 = options.alertThresholdP95 || 100; // 100ms SLA
    this.alertCallback = options.onAlert;
  }

  async probeRegion(region: string): Promise<ProbeResult> {
    const url = this.targetUrl(region);
    const start = Date.now();

    try {
      const res = await fetch(url, {
        method: 'GET',
        cf: { cacheTtl: 0 },
      } as RequestInit & { cf: { cacheTtl: number } });

      const latency = Date.now() - start;
      const success = res.status === 200;

    // Record to Prometheus (dynamic import to avoid module-scope crash)
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

  async runProbes(): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];

    for (const region of this.regions) {
      const result = await this.probeRegion(region);
      results.push(result);
      this.recordResult(result);
    }

    this.updateHealth();
    this.checkSLA(results);
    return results;
  }

  private recordResult(result: ProbeResult): void {
    this.results.push(result);
    if (this.results.length > this.maxResults) {
      this.results = this.results.slice(-this.maxResults);
    }
  }

  private updateHealth(): void {
    for (const region of this.regions) {
      const regionResults = this.results.filter(r => r.region === region && Date.now() - r.timestamp < 300000); // Last 5 min

      if (regionResults.length === 0) {
        this.regionHealth.set(region, {
          region,
          latencyP50: 0,
          latencyP95: 0,
          latencyP99: 0,
          healthy: false,
          lastCheck: Date.now(),
          errorRate: 1,
        });
        continue;
      }

      const latencies = regionResults.map(r => r.latencyMs).sort((a, b) => a - b);
      const errors = regionResults.filter(r => r.status === 'failure').length;
      const errorRate = errors / regionResults.length;

      const p50 = this.percentile(latencies, 50);
      const p95 = this.percentile(latencies, 95);
      const p99 = this.percentile(latencies, 99);

      this.regionHealth.set(region, {
        region,
        latencyP50: p50,
        latencyP95: p95,
        latencyP99: p99,
        healthy: errorRate < 0.1 && p95 < 200, // <10% errors, <200ms p95
        lastCheck: Date.now(),
        errorRate,
      });
    }
  }

  private checkSLA(results: ProbeResult[]): void {
    for (const result of results) {
      if (result.latencyMs > this.alertThresholdP95) {
        logger.warn(`[LatencyMonitor] SLA breach: ${result.region} p95=${result.latencyMs}ms (threshold: ${this.alertThresholdP95}ms)`);
        if (this.alertCallback) {
          this.alertCallback(result.region, result.latencyMs);
        }
      }
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  getHealth(region?: string): RegionMetrics[] {
    if (region) {
      const r = this.regionHealth.get(region);
      return r ? [r] : [];
    }
    return Array.from(this.regionHealth.values());
  }

  getBestRegion(clientRegion?: string): string {
    const healthy = Array.from(this.regionHealth.values()).filter(h => h.healthy);
    if (healthy.length === 0) return this.regions[0];

    // Prefer client's region if healthy
    if (clientRegion && healthy.some(h => h.region === clientRegion)) {
      return clientRegion;
    }

    // Sort by latency (lower is better)
    healthy.sort((a, b) => a.latencyP95 - b.latencyP95);
    return healthy[0].region;
  }

  getResults(): ProbeResult[] {
    return [...this.results];
  }

  // Start periodic probing (for Node.js environments)
  // Lazy-safe: safe to call multiple times; only starts once.
  start(intervalMs?: number): () => void {
    if (this.stopInterval) {
      return this.stopInterval;
    }

    const interval = setInterval(() => {
      this.runProbes().catch((err) => logger.error('[LatencyMonitor] probe error', { error: err }));
    }, intervalMs || this.probeInterval);

    // Run immediately
    this.runProbes().catch((err) => logger.error('[LatencyMonitor] initial probe error', { error: err }));

    this.stopInterval = () => clearInterval(interval);
    return this.stopInterval;
  }
}

// Singleton for global use
let globalMonitor: LatencyMonitor | null = null;

export function getLatencyMonitor(): LatencyMonitor {
  if (!globalMonitor) {
    globalMonitor = new LatencyMonitor(
      ['us-east', 'eu-central', 'ap-southeast'],
      {
        probeInterval: 30000,
        alertThresholdP95: 100, // default SLA threshold (ms)
        onAlert: (region, p95) => {
          // Could integrate with Telegram/PagerDuty here
          logger.warn(`[SLA] Region ${region} exceeded latency threshold: ${p95.toFixed(1)}ms`);
        },
      }
    );
  }
  return globalMonitor;
}
