/**
 * Multi-Region Latency Monitor
 * Probes regional endpoints and tracks health metrics
 * Also integrates with Prometheus for observability
 */

import { logger } from '../utils/logger';
import {
  type RegionMetrics,
  type ProbeResult,
  type LatencyMonitorOptions,
} from './latency-monitor-types';
import {
  computeRegionMetrics,
  probeRegionEndpoint,
} from './latency-monitor-math';

export type { RegionMetrics, ProbeResult, LatencyMonitorOptions } from './latency-monitor-types';
export { calculatePercentile, computeRegionMetrics } from './latency-monitor-math';

export class LatencyMonitor {
  private regions: string[];
  private targetUrl: (region: string) => string;
  private probeInterval: number;
  private results: ProbeResult[] = [];
  private maxResults = 1000;
  private regionHealth: Map<string, RegionMetrics> = new Map();
  private alertThresholdP95: number;
  private alertCallback?: (region: string, p95: number) => void;
  private stopInterval?: () => void;

  constructor(regions: string[], options: LatencyMonitorOptions = {}) {
    this.regions = regions;
    this.targetUrl = options.targetUrl || ((region) => `https://${region}.algo-trader.workers.dev/api/health`);
    this.probeInterval = options.probeInterval || 30000;
    this.alertThresholdP95 = options.alertThresholdP95 || 100;
    this.alertCallback = options.onAlert;
  }

  async probeRegion(region: string): Promise<ProbeResult> {
    return probeRegionEndpoint(this.targetUrl(region), region);
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
      const regionResults = this.results.filter(
        r => r.region === region && Date.now() - r.timestamp < 300000,
      );
      this.regionHealth.set(region, computeRegionMetrics(region, regionResults));
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

    if (clientRegion && healthy.some(h => h.region === clientRegion)) {
      return clientRegion;
    }

    healthy.sort((a, b) => a.latencyP95 - b.latencyP95);
    return healthy[0].region;
  }

  getResults(): ProbeResult[] {
    return [...this.results];
  }

  start(intervalMs?: number): () => void {
    if (this.stopInterval) {
      return this.stopInterval;
    }

    const interval = setInterval(() => {
      this.runProbes().catch((err) => logger.error('[LatencyMonitor] probe error', { error: err }));
    }, intervalMs || this.probeInterval);

    this.runProbes().catch((err) => logger.error('[LatencyMonitor] initial probe error', { error: err }));

    this.stopInterval = () => clearInterval(interval);
    return this.stopInterval;
  }
}

let globalMonitor: LatencyMonitor | null = null;

export function getLatencyMonitor(): LatencyMonitor {
  if (!globalMonitor) {
    globalMonitor = new LatencyMonitor(
      ['us-east', 'eu-central', 'ap-southeast'],
      {
        probeInterval: 30000,
        alertThresholdP95: 100,
        onAlert: (region, p95) => {
          logger.warn(`[SLA] Region ${region} exceeded latency threshold: ${p95.toFixed(1)}ms`);
        },
      }
    );
  }
  return globalMonitor;
}
