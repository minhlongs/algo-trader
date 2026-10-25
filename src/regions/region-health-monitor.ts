/**
 * Region Health Monitor
 * Monitors region health and triggers automatic failover
 */

import { getLatencyMonitor } from './latency-monitor';
import { logger } from '../shared/utils/logger';
import { RegionStatus, FailoverConfig, DEFAULT_REGION_CONFIG } from './region-health-types';
import { announceRegionChange, decideFailover } from './region-failover-selection';

export type { RegionStatus, FailoverConfig };

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

      if (current.region === this.activeRegion) {
        await this.triggerFailoverIfActiveUnhealthy();
      }
    }

    await this.attemptRecovery();
  }

  private async triggerFailoverIfActiveUnhealthy(): Promise<void> {
    const decision = decideFailover(this.activeRegion, this.regionStatus, this.config);
    if (!decision?.nextRegion) return;

    const oldRegion = this.activeRegion;
    logger.warn(`Failover triggered: ${oldRegion} is unhealthy`, 'RegionHealthMonitor');
    this.activeRegion = decision.nextRegion;
    announceRegionChange(oldRegion, decision.nextRegion, 'failover');
    this.onFailover?.(oldRegion, decision.nextRegion);
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
    announceRegionChange(old, toRegion, 'manual');
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
