/**
 * Memory Pressure Handler
 * Monitors memory usage and triggers cleanup when thresholds exceeded
 *
 * Target: <128MB peak, warning at 100MB, critical at 115MB
 * Auto-cleanup: <100ms cleanup latency
 */

import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import { recordMemoryPressureEvent } from '../../shared/observability/prometheus-metrics';
import {
  MemoryMetrics,
  MemoryPressureConfig,
  PressureLevel,
  DEFAULT_MEMORY_PRESSURE_CONFIG,
  evaluatePressureLevel,
} from './memory-pressure-types';
import {
  extractMemoryMetrics,
  exportMetricsToPrometheus,
} from './memory-stats-provider';

export type { MemoryMetrics, MemoryPressureConfig, PressureLevel };

export class MemoryPressureHandler {
  private config: MemoryPressureConfig;
  private redis: RedisClientType;
  private intervalId: NodeJS.Timeout | null = null;
  private pressureLevel: PressureLevel = 'normal';
  private metricsHistory: MemoryMetrics[] = [];
  private readonly MAX_HISTORY_SIZE = 100;

  constructor(config: Partial<MemoryPressureConfig> = {}) {
    this.config = {
      ...DEFAULT_MEMORY_PRESSURE_CONFIG,
      onCritical: this.defaultCriticalHandler.bind(this),
      ...config,
    };
    this.redis = getRedisClient();
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('[MemoryPressure] Already started');
      return;
    }
    this.intervalId = setInterval(() => this.checkAndHandle(), this.config.checkIntervalMs);
    logger.info('[MemoryPressure] Monitoring started', {
      intervalMs: this.config.checkIntervalMs,
      warningMb: this.config.warningThresholdMb,
      criticalMb: this.config.criticalThresholdMb,
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[MemoryPressure] Monitoring stopped');
    }
  }

  async checkAndHandle(): Promise<void> {
    const metrics = this.getMemoryMetrics();

    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
      this.metricsHistory.shift();
    }

    this.exportMetrics(metrics);

    const previousLevel = this.pressureLevel;
    this.pressureLevel = evaluatePressureLevel(
      metrics.rss,
      this.config.warningThresholdMb,
      this.config.criticalThresholdMb,
    );

    if (this.pressureLevel !== previousLevel) {
      const rssMb = metrics.rss / 1024 / 1024;
      logger.warn('[MemoryPressure] Level changed', {
        from: previousLevel,
        to: this.pressureLevel,
        rssMb: rssMb.toFixed(1),
      });

      if (this.pressureLevel === 'critical') {
        recordMemoryPressureEvent('critical');
        await this.triggerCriticalCleanup();
      } else if (this.pressureLevel === 'warning' && previousLevel !== 'warning') {
        recordMemoryPressureEvent('warning');
        await this.triggerLightCleanup();
      }
    }

    if (this.pressureLevel !== 'normal' && this.config.autoCleanup) {
      await this.triggerCleanup();
    }
  }

  getMemoryMetrics(): MemoryMetrics {
    return extractMemoryMetrics();
  }

  private async triggerCriticalCleanup(): Promise<void> {
    logger.error('[MemoryPressure] CRITICAL: Triggering aggressive cleanup');
    await this.triggerCleanup();

    if (typeof gc === 'function') {
      (gc as () => void)();
    }

    if (this.config.onCritical) {
      await this.config.onCritical();
    }

    await this.redis.publish('memory-pressure', JSON.stringify({
      level: 'critical',
      rss: this.getMemoryMetrics().rss,
      timestamp: Date.now(),
    }));

    logger.error('[MemoryPressure] Aggressive cleanup complete');
  }

  private async triggerLightCleanup(): Promise<void> {
    logger.warn('[MemoryPressure] WARNING: Triggering light cleanup');
    await this.triggerCleanup();
  }

  private async triggerCleanup(): Promise<void> {
    try {
      logger.info('[MemoryPressure] Cleaning up memory resources...');
      await this.redis.setex('memory:cleanup:triggered', 60, Date.now().toString());
    } catch (error) {
      logger.error('[MemoryPressure] Cleanup failed:', error);
    }
  }

  private async defaultCriticalHandler(): Promise<void> {
    logger.error('[MemoryPressure] Critical handler - degrading functionality');
    await this.redis.publish('memory-pressure:degraded', JSON.stringify({
      action: 'degrade',
      timestamp: Date.now(),
    }));
  }

  private exportMetrics(metrics: MemoryMetrics): void {
    exportMetricsToPrometheus(metrics, this.pressureLevel, this.metricsHistory.length);
  }

  getPressureLevel(): PressureLevel {
    return this.pressureLevel;
  }

  getMemorySummary(): {
    metrics: MemoryMetrics;
    level: PressureLevel;
    historySize: number;
  } {
    return {
      metrics: this.getMemoryMetrics(),
      level: this.pressureLevel,
      historySize: this.metricsHistory.length,
    };
  }
}

let pressureHandlerInstance: MemoryPressureHandler | null = null;

export function getMemoryPressureHandler(config?: Partial<MemoryPressureConfig>): MemoryPressureHandler {
  if (!pressureHandlerInstance) {
    pressureHandlerInstance = new MemoryPressureHandler(config);
  }
  return pressureHandlerInstance;
}
