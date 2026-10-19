/**
 * Region Health Monitor
 * Monitors region health and triggers automatic failover
 */

import { getLatencyMonitor } from './latency-monitor';
import { logger } from '../shared/utils/logger';
import { RegionStatus, FailoverConfig, DEFAULT_REGION_CONFIG } from './region-health-types';

export { RegionStatus, FailoverConfig };

export class RegionHealthMonitor {
  private config: FailoverConfig;
  private regionStatus: Map<string, RegionStatus> = new Map();
  private activeRegion: string;
  private regions: string[];
  private monitor: NodeJS.Timeout | null = null;
  private onFailover?: (from: string, to: string) => void;

  constructor(
    regions: string[],
    initialActive: string,
    options: { config?: FailoverConfig; onFailover?: (from: string, to: string) => void } = {}
  ) {
    this.regions = regions;
    this.activeRegion = initialActive;
    this.config = { ...DEFAULT_REGION_CONFIG, ...options.config };
    this.onFailover = options.onFailover;

    for (const region of regions) {
      this.regionStatus.set(region, {
        region,
        healthy: true,
        latencyMs: 0,
        errorRate: 0,
        lastCheck: 0,
        consecutiveFailures: 0,
      });
    }
  }

  start(): void {
    this.monitor = setInterval(() => {
      this.checkAllRegions().catch((err) => logger.error('Region health check failed', 'RegionHealthMonitor', { err: String(err) }));
    }, this.config.checkInterval);
    this.checkAllRegions().catch((err) => logger.error('Initial region health check failed', 'RegionHealthMonitor', { err: String(err) }));
  }

  stop(): void {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
  }

  ensureStarted(): void {
    getLatencyMonitor().start();
  }

  async checkAllRegions(): Promise<void> {
    const latencyMonitor = getLatencyMonitor();
    latencyMonitor.start();
    await latencyMonitor.runProbes();

    const health = latencyMonitor.getHealth();

    for (const status of health) {
      const current = this.regionStatus.get(status.region)!;
      current.healthy = status.healthy && status.latencyP95 < 200;
      current.latencyMs = status.latencyP95;
      current.errorRate = status.errorRate;
      current.lastCheck = Date.now();

      if (!current.healthy) {
        current.consecutiveFailures++;
      } else {
        current.consecutiveFailures = 0;
      }

      if (current.region === this.activeRegion && current.consecutiveFailures >= this.config.failoverThreshold) {
        await this.triggerFailover(current.region);
      }
    }

    await this.attemptRecovery();
  }

  private async triggerFailover(failedRegion: string): Promise<void> {
    logger.warn(`Failover triggered: ${failedRegion} is unhealthy`, 'RegionHealthMonitor');
    const healthyRegions = Array.from(this.regionStatus.values())
      .filter(s => s.healthy && s.region !== failedRegion);

    if (healthyRegions.length === 0) {
      logger.error('No healthy regions available for failover', 'RegionHealthMonitor');
      return;
    }

    const sorted = healthyRegions.sort((a, b) => a.latencyMs - b.latencyMs);
    const newRegion = sorted[0].region;
    const oldRegion = this.activeRegion;
    this.activeRegion = newRegion;

    logger.warn(`Failover complete: ${oldRegion} → ${newRegion}`, 'RegionHealthMonitor');
    if (this.onFailover) {
      this.onFailover(oldRegion, newRegion);
    }
  }

  private async attemptRecovery(): Promise<void> {
    for (const [region, status] of Array.from(this.regionStatus.entries())) {
      if (region === this.activeRegion) continue;
      if (status.consecutiveFailures > 0 && status.consecutiveFailures < this.config.failoverThreshold) {
        const freshHealth = getLatencyMonitor().getHealth(region)[0];
        if (freshHealth?.healthy) {
          status.consecutiveFailures = 0;
          logger.info(`Region ${region} recovered`, 'RegionHealthMonitor');
        }
      }
    }
  }

  getActiveRegion(): string {
    return this.activeRegion;
  }

  getStatus(region?: string): RegionStatus[] {
    if (region) {
      const s = this.regionStatus.get(region);
      return s ? [s] : [];
    }
    return Array.from(this.regionStatus.values());
  }

  isRegionHealthy(region: string): boolean {
    return this.regionStatus.get(region)?.healthy ?? false;
  }

  async forceSwitch(toRegion: string): Promise<boolean> {
    if (!this.regionStatus.get(toRegion)?.healthy) {
      return false;
    }
    const old = this.activeRegion;
    this.activeRegion = toRegion;
    logger.warn(`Manual switch: ${old} → ${toRegion}`, 'RegionHealthMonitor');
    if (this.onFailover) {
      this.onFailover(old, toRegion);
    }
    return true;
  }
}

export function createRegionHealthMonitor(
  regions: string[],
  initialActive: string,
  options?: { onFailover?: (from: string, to: string) => void }
): RegionHealthMonitor {
  return new RegionHealthMonitor(regions, initialActive, options);
}
