/**
 * Memory Pressure Handler
 * Monitors memory usage and triggers cleanup when thresholds exceeded
 *
 * Target: <128MB peak, warning at 100MB, critical at 115MB
 * Auto-cleanup: <100ms cleanup latency
 */

import { getRedisClient, type RedisClientType } from '../redis';
import { logger } from '../utils/logger';
import {
  setMemoryMetrics,
  recordMemoryPressureEvent,
  recordCacheEviction,
} from '../../shared/observability/prometheus-metrics';

export interface MemoryMetrics {
  rss: number; // Resident set size
  heapUsed: number;
  heapTotal: number;
  external: number;
  limit: number; // 128MB for Cloudflare Workers
}

export interface MemoryPressureConfig {
  warningThresholdMb: number; // 100MB default
  criticalThresholdMb: number; // 115MB default
  checkIntervalMs: number; // 5000ms default
  autoCleanup: boolean;
  onCritical?: () => Promise<void>;
}

export type PressureLevel = 'normal' | 'warning' | 'critical';

export class MemoryPressureHandler {
  private config: MemoryPressureConfig;
  private redis: RedisClientType;
  private intervalId: NodeJS.Timeout | null = null;
  private pressureLevel: PressureLevel = 'normal';
  private metricsHistory: MemoryMetrics[] = [];
  private readonly MAX_HISTORY_SIZE = 100;

  // Prometheus metrics (would be defined in prometheus-metrics.ts)
  private memoryRssGauge?: any;
  private memoryHeapGauge?: any;
  private memoryUtilizationGauge?: any;

  constructor(config: Partial<MemoryPressureConfig> = {}) {
    this.config = {
      warningThresholdMb: 100,
      criticalThresholdMb: 115,
      checkIntervalMs: 5000,
      autoCleanup: true,
      onCritical: this.defaultCriticalHandler.bind(this),
      ...config,
    };
    this.redis = getRedisClient();
  }

  /**
   * Start monitoring memory pressure
   */
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

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[MemoryPressure] Monitoring stopped');
    }
  }

  /**
   * Check memory and handle pressure if needed
   */
  async checkAndHandle(): Promise<void> {
    const metrics = this.getMemoryMetrics();

    // Record in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
      this.metricsHistory.shift();
    }

    // Export metrics
    this.exportMetrics(metrics);

    const previousLevel = this.pressureLevel;

    // Determine pressure level
    const rssMb = metrics.rss / 1024 / 1024;
    if (rssMb >= this.config.criticalThresholdMb) {
      this.pressureLevel = 'critical';
    } else if (rssMb >= this.config.warningThresholdMb) {
      this.pressureLevel = 'warning';
    } else {
      this.pressureLevel = 'normal';
    }

    // Handle state transition
    if (this.pressureLevel !== previousLevel) {
      logger.warn('[MemoryPressure] Level changed', {
        from: previousLevel,
        to: this.pressureLevel,
        rssMb: rssMb.toFixed(1),
      });

      // Record pressure event for critical transitions
      if (this.pressureLevel === 'critical') {
        recordMemoryPressureEvent('critical');
        await this.triggerCriticalCleanup();
      } else if (this.pressureLevel === 'warning' && previousLevel !== 'warning') {
        recordMemoryPressureEvent('warning');
        await this.triggerLightCleanup();
      }
    }

    // Continuous cleanup if still high
    if (this.pressureLevel !== 'normal' && this.config.autoCleanup) {
      await this.triggerCleanup();
    }
  }

  /**
   * Get current memory metrics
   */
  getMemoryMetrics(): MemoryMetrics {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const mem = (performance as any).memory;
      return {
        rss: mem.rss || 0,
        heapUsed: mem.usedJSHeapSize || 0,
        heapTotal: mem.totalJSHeapSize || 0,
        external: mem.external || 0,
        limit: 128 * 1024 * 1024, // Cloudflare Worker limit
      };
    }

    // Non-Worker environment (Node.js for testing)
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      return {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external || 0,
        limit: 128 * 1024 * 1024,
      };
    }

    return {
      rss: 0,
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      limit: 128 * 1024 * 1024,
    };
  }

  /**
   * Trigger aggressive cleanup for critical memory pressure
   */
  private async triggerCriticalCleanup(): Promise<void> {
    logger.error('[MemoryPressure] CRITICAL: Triggering aggressive cleanup');

    // 1. Clear all caches
    await this.triggerCleanup();

    // 2. Suggest GC (Workers may not respect this, but Node.js does)
    if (typeof gc === 'function') {
      (gc as any)();
    }

    // 3. Call custom critical handler
    if (this.config.onCritical) {
      await this.config.onCritical();
    }

    // 4. Publish alert to Redis for cross-region awareness
    await this.redis.publish('memory-pressure', JSON.stringify({
      level: 'critical',
      rss: this.getMemoryMetrics().rss,
      timestamp: Date.now(),
    }));

    logger.error('[MemoryPressure] Aggressive cleanup complete');
  }

  /**
   * Trigger lighter cleanup for warning level
   */
  private async triggerLightCleanup(): Promise<void> {
    logger.warn('[MemoryPressure] WARNING: Triggering light cleanup');
    await this.triggerCleanup();
  }

  /**
   * General cleanup - clear caches, pools, compress state
   */
  private async triggerCleanup(): Promise<void> {
    // Clear LRU caches (if accessible)
    try {
      // This would import and clear actual caches in production
      // For now, log the intent
      logger.info('[MemoryPressure] Cleaning up memory resources...');

      // Clear compression manager cache
      // compression manager has no state to clear currently

      // Signal to other components via Redis
      await this.redis.setex('memory:cleanup:triggered', 60, Date.now().toString());
    } catch (error) {
      logger.error('[MemoryPressure] Cleanup failed:', error);
    }
  }

  /**
   * Default critical handler - degrades gracefully
   */
  private async defaultCriticalHandler(): Promise<void> {
    logger.error('[MemoryPressure] Critical handler - degrading functionality');

    // Could trigger:
    // - Reduce strategy cache size
    // - Disable background agents
    // - Route to larger-memory regions
    // - Reduce batch sizes

    await this.redis.publish('memory-pressure:degraded', JSON.stringify({
      action: 'degrade',
      timestamp: Date.now(),
    }));
  }

  /**
   * Export metrics to Prometheus
   */
  private exportMetrics(metrics: MemoryMetrics): void {
    const usedMb = metrics.rss / 1024 / 1024;
    const heapMb = metrics.heapUsed / 1024 / 1024;
    const utilization = metrics.rss / metrics.limit;

    // Update Prometheus gauges
    setMemoryMetrics(metrics.rss, metrics.heapUsed);

    // Log summary periodically (every 10th check to avoid spam)
    if (this.metricsHistory.length % 10 === 0) {
      logger.info('[MemoryPressure] Metrics', {
        rssMb: usedMb.toFixed(1),
        heapMb: heapMb.toFixed(1),
        utilizationPct: (utilization * 100).toFixed(1),
        level: this.pressureLevel,
      });
    }
  }

  /**
   * Get current pressure level
   */
  getPressureLevel(): PressureLevel {
    return this.pressureLevel;
  }

  /**
   * Get memory usage summary
   */
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

// Singleton instance
let pressureHandlerInstance: MemoryPressureHandler | null = null;

export function getMemoryPressureHandler(config?: Partial<MemoryPressureConfig>): MemoryPressureHandler {
  if (!pressureHandlerInstance) {
    pressureHandlerInstance = new MemoryPressureHandler(config);
  }
  return pressureHandlerInstance;
}
