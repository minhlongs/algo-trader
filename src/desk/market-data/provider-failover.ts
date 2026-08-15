// SPDX-License-Identifier: MIT
/**
 * Provider Failover Manager
 * Automatic failover with circuit breaker pattern
 */

import { logger } from '../../shared/utils/logger';
import {
  ProviderHealthStatus,
  MarketDataSource,
  ProviderFailoverConfig,
  FailoverEvent,
} from './types';
import { SlaTracker } from './sla-tracker';
import {
  recordFailoverEvent,
  setCircuitBreakerState,
} from '../../platform/middleware/prometheus-metrics';

/**
 * Circuit breaker states
 */
enum CircuitState {
  CLOSED = 'closed',     // Normal operation, requests pass through
  OPEN = 'open',         // Failover active, primary blocked
  HALF_OPEN = 'half_open', // Testing if primary recovered
}

/**
 * Provider health snapshot
 */
interface ProviderHealthSnapshot {
  provider: MarketDataSource;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  isActive: boolean;
  isPrimary: boolean;
  lastSuccess: number;
  lastFailure: number;
  avgLatency: number;
  requestCount: number;
}

/**
 * Failover Manager
 *
 * Implements circuit breaker pattern for automatic provider failover.
 * Monitors health and switches to secondary when primary degrades.
 */
export { ProviderHealthStatus };

export class FailoverManager {
  private config: Required<ProviderFailoverConfig>;
  private providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>;
  private circuitState: CircuitState;
  private circuitStateTimestamp: number;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private slaTracker: SlaTracker;
  private failoverHistory: FailoverEvent[];
  private readonly MAX_HISTORY = 1000;

  constructor(config: ProviderFailoverConfig) {
    this.config = {
      ...config,
      failureThreshold: config.failureThreshold ?? 3,
      failbackCooldownMs: config.failbackCooldownMs ?? 5 * 60 * 1000,
      recoveryTimeMs: config.recoveryTimeMs ?? 60 * 1000,
      enableAutoFailback: config.enableAutoFailback ?? true,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 10_000,
    };

    // Initialize provider status
    this.providerStatus = new Map();
    this.failoverHistory = [];

    // Set initial state: primary active, secondary standby
    this.providerStatus.set(this.config.primary, {
      provider: this.config.primary,
      status: ProviderHealthStatus.HEALTHY,
      consecutiveFailures: 0,
      isActive: true,
      isPrimary: true,
      lastSuccess: Date.now(),
      lastFailure: 0,
      avgLatency: 0,
      requestCount: 0,
    });

    this.providerStatus.set(this.config.secondary, {
      provider: this.config.secondary,
      status: ProviderHealthStatus.HEALTHY,
      consecutiveFailures: 0,
      isActive: false,
      isPrimary: false,
      lastSuccess: Date.now(),
      lastFailure: 0,
      avgLatency: 0,
      requestCount: 0,
    });

    this.circuitState = CircuitState.CLOSED;
    this.circuitStateTimestamp = Date.now();
    this.slaTracker = new SlaTracker();

    // Start health check timer
    this.startHealthChecks();
  }

  /**
   * Get currently active provider
   */
  getActiveProvider(): MarketDataSource {
    for (const [provider, snapshot] of this.providerStatus) {
      if (snapshot.isActive) {
        return provider;
      }
    }
    return this.config.primary; // Fallback
  }

  /**
   * Record a request result (success/failure)
   */
  recordRequestResult(success: boolean, latencyMs: number): void {
    const activeProvider = this.getActiveProvider();
    const snapshot = this.providerStatus.get(activeProvider);
    if (!snapshot) return;

    // Update SLA tracker
    this.slaTracker.recordRequest(activeProvider, success, latencyMs);

    // Update provider stats
    snapshot.requestCount++;
    if (success) {
      snapshot.lastSuccess = Date.now();
      // Exponential moving average for latency
      snapshot.avgLatency = snapshot.avgLatency * 0.7 + latencyMs * 0.3;
      snapshot.consecutiveFailures = 0;
      this.updateStatus(activeProvider, this.calculateHealthStatus(snapshot));
    } else {
      snapshot.lastFailure = Date.now();
      snapshot.consecutiveFailures++;
      this.updateStatus(activeProvider, this.calculateHealthStatus(snapshot));

      // Check if we need to trigger failover
      if (this.circuitState === CircuitState.CLOSED &&
          snapshot.consecutiveFailures >= this.config.failureThreshold) {
        this.triggerFailover(`Consecutive failures: ${snapshot.consecutiveFailures}`);
      }
    }

    // Record metrics would be here
  }

  /**
   * Manually trigger failover to secondary
   */
  async forceFailover(reason: string): Promise<boolean> {
    const currentActive = this.getActiveProvider();
    if (currentActive === this.config.secondary) {
      return false; // Already on secondary
    }

    const success = this.switchActiveProvider(this.config.secondary);
    this.updateStatus(this.config.secondary, ProviderHealthStatus.DEGRADED);
  this.updateStatus(this.config.secondary, ProviderHealthStatus.DEGRADED);
    if (success) {
      this.circuitState = CircuitState.OPEN;
      this.circuitStateTimestamp = Date.now();
      this.recordFailoverEvent(this.config.primary, this.config.secondary, reason, 'manual');
    }
    return success;
  }

  /**
   * Manually trigger failback to primary
   */
  async forceFailback(reason: string): Promise<boolean> {
    const currentActive = this.getActiveProvider();
    if (currentActive === this.config.primary) {
      return false; // Already on primary
    }

    // Check if secondary is healthy enough for failback
    const secondarySnapshot = this.providerStatus.get(this.config.secondary);
    if (!secondarySnapshot || secondarySnapshot.status === ProviderHealthStatus.UNHEALTHY) {
      logger.warn('Failback blocked: secondary unhealthy', { provider: this.config.secondary, status: secondarySnapshot?.status });
      return false;
    }

    const success = this.switchActiveProvider(this.config.primary);
    if (success) {
      this.circuitState = CircuitState.CLOSED;
      this.circuitStateTimestamp = Date.now();
      this.recordFailoverEvent(this.config.secondary, this.config.primary, reason, 'manual');
    }
    return success;
  }

  /**
   * Get failover history
   */
  getFailoverHistory(): FailoverEvent[] {
    return [...this.failoverHistory];
  }

  /**
   * Get health snapshots for all providers
   */
  getAllHealthSnapshots(): ProviderHealthSnapshot[] {
    return Array.from(this.providerStatus.values());
  }

  /**
   * Stop the failover manager and cleanup
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    const activeProvider = this.getActiveProvider();
    const inactiveProvider = activeProvider === this.config.primary ? this.config.secondary : this.config.primary;
    const activeSnapshot = this.providerStatus.get(activeProvider);
    const inactiveSnapshot = this.providerStatus.get(inactiveProvider);

    if (!activeSnapshot || !inactiveSnapshot) return;

    // Check if we should attempt recovery (HALF_OPEN state)
    if (this.circuitState === CircuitState.OPEN) {
      const timeInOpen = Date.now() - this.circuitStateTimestamp;

      if (timeInOpen >= this.config.failbackCooldownMs) {
        // Switch to HALF_OPEN to test primary
        logger.info('Entering HALF_OPEN state to test primary recovery');
        this.circuitState = CircuitState.HALF_OPEN;
        this.circuitStateTimestamp = Date.now();

        // Temporarily mark primary as active for health check
        const primarySnapshot = this.providerStatus.get(this.config.primary);
        if (primarySnapshot) {
          primarySnapshot.isActive = true;
        }
      }
    }

    // Update circuit breaker metric
    const isOpen = this.circuitState === CircuitState.OPEN;
    setCircuitBreakerState(isOpen);
  }

  private updateStatus(provider: MarketDataSource, newStatus: ProviderHealthStatus): void {
    const snapshot = this.providerStatus.get(provider);
    if (!snapshot) return;

    const oldStatus = snapshot.status;
    snapshot.status = newStatus;

    if (oldStatus !== newStatus) {
      logger.info('FailoverManager: Provider status changed', {
        provider,
        oldStatus,
        newStatus,
        consecutiveFailures: snapshot.consecutiveFailures,
      });
    }
  }

  private calculateHealthStatus(snapshot: ProviderHealthSnapshot): ProviderHealthStatus {
    if (snapshot.consecutiveFailures >= this.config.failureThreshold) {
      return ProviderHealthStatus.UNHEALTHY;
    }
    if (snapshot.consecutiveFailures > 0) {
      return ProviderHealthStatus.DEGRADED;
    }
    return ProviderHealthStatus.HEALTHY;
  }

  private switchActiveProvider(newActive: MarketDataSource): boolean {
    let switched = false;

    for (const [provider, snapshot] of this.providerStatus) {
      const wasActive = snapshot.isActive;
      snapshot.isActive = provider === newActive;

      if (wasActive && !snapshot.isActive) {
        logger.warn('FailoverManager: Provider deactivated', { provider });
      } else if (!wasActive && snapshot.isActive) {
        logger.info('FailoverManager: Provider activated', { provider });
        switched = true;
      }
    }

    return switched;
  }

  private triggerFailover(reason: string): void {
    logger.error('FailoverManager: Triggering automatic failover', {
      fromProvider: this.config.primary,
      toProvider: this.config.secondary,
      reason,
    });

    this.switchActiveProvider(this.config.secondary);
    this.updateStatus(this.config.secondary, ProviderHealthStatus.DEGRADED);
    this.circuitState = CircuitState.OPEN;
    this.circuitStateTimestamp = Date.now();
    this.recordFailoverEvent(this.config.primary, this.config.secondary, reason, 'automatic');
  }

  private recordFailoverEvent(
    fromProvider: MarketDataSource,
    toProvider: MarketDataSource,
    reason: string,
    triggeredBy: 'automatic' | 'manual'
  ): void {
    const event: FailoverEvent = {
      timestamp: Date.now(),
      fromProvider,
      toProvider,
      reason,
      triggeredBy,
    };

    this.failoverHistory.unshift(event);

    // Trim history
    if (this.failoverHistory.length > this.MAX_HISTORY) {
      this.failoverHistory = this.failoverHistory.slice(0, this.MAX_HISTORY);
    }

    // Record metric
    const reasonType = reason.includes("consecutive") ? "health_check" : triggeredBy;
    const direction =
      fromProvider === this.config.primary
        ? "primary_to_fallback"
        : "fallback_to_primary";
    recordFailoverEvent(fromProvider as string, direction);
  }
}
