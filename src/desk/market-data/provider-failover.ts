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
  CircuitState,
  ProviderHealthSnapshot,
} from './provider-failover-types';
import {
  createFailoverEvent,
  recordFailoverMetric,
  appendFailoverEvent,
} from './provider-failover-events';
import {
  calculateHealthStatus,
  updateProviderStatus,
  switchActiveProvider,
  initializeProviderStatus,
  checkHalfOpenTransition,
} from './provider-failover-health';
import { SlaTracker } from './sla-tracker';
import { setCircuitBreakerState } from '../../platform/middleware/prometheus-metrics';

export {
  ProviderHealthStatus,
  MarketDataSource,
  ProviderFailoverConfig,
  FailoverEvent,
  CircuitState,
  ProviderHealthSnapshot,
};

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

    this.providerStatus = initializeProviderStatus(this.config.primary, this.config.secondary);
    this.failoverHistory = [];
    this.circuitState = CircuitState.CLOSED;
    this.circuitStateTimestamp = Date.now();
    this.slaTracker = new SlaTracker();

    this.startHealthChecks();
  }

  getActiveProvider(): MarketDataSource {
    for (const [provider, snapshot] of this.providerStatus) {
      if (snapshot.isActive) return provider;
    }
    return this.config.primary;
  }

  recordRequestResult(success: boolean, latencyMs: number): void {
    const activeProvider = this.getActiveProvider();
    const snapshot = this.providerStatus.get(activeProvider);
    if (!snapshot) return;

    this.slaTracker.recordRequest(activeProvider, success, latencyMs);
    snapshot.requestCount++;

    if (success) {
      snapshot.lastSuccess = Date.now();
      snapshot.avgLatency = snapshot.avgLatency * 0.7 + latencyMs * 0.3;
      snapshot.consecutiveFailures = 0;
    } else {
      snapshot.lastFailure = Date.now();
      snapshot.consecutiveFailures++;
    }
    updateProviderStatus(this.providerStatus, activeProvider, calculateHealthStatus(snapshot, this.config.failureThreshold));

    if (!success && this.circuitState === CircuitState.CLOSED && snapshot.consecutiveFailures >= this.config.failureThreshold) {
      this.triggerFailover(`Consecutive failures: ${snapshot.consecutiveFailures}`);
    }
  }

  async forceFailover(reason: string): Promise<boolean> {
    if (this.getActiveProvider() === this.config.secondary) return false;
    const success = switchActiveProvider(this.providerStatus, this.config.secondary);
    updateProviderStatus(this.providerStatus, this.config.secondary, ProviderHealthStatus.DEGRADED);
    if (success) {
      this.circuitState = CircuitState.OPEN;
      this.circuitStateTimestamp = Date.now();
      this.recordFailoverEvent(this.config.primary, this.config.secondary, reason, 'manual');
    }
    return success;
  }

  async forceFailback(reason: string): Promise<boolean> {
    if (this.getActiveProvider() === this.config.primary) return false;
    const secondary = this.providerStatus.get(this.config.secondary);
    if (!secondary || secondary.status === ProviderHealthStatus.UNHEALTHY) {
      logger.warn('Failback blocked: secondary unhealthy', { provider: this.config.secondary, status: secondary?.status });
      return false;
    }
    const success = switchActiveProvider(this.providerStatus, this.config.primary);
    if (success) {
      this.circuitState = CircuitState.CLOSED;
      this.circuitStateTimestamp = Date.now();
      this.recordFailoverEvent(this.config.secondary, this.config.primary, reason, 'manual');
    }
    return success;
  }

  getFailoverHistory(): FailoverEvent[] {
    return [...this.failoverHistory];
  }

  getAllHealthSnapshots(): ProviderHealthSnapshot[] {
    return Array.from(this.providerStatus.values());
  }

  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    const active = this.getActiveProvider();
    const inactive = active === this.config.primary ? this.config.secondary : this.config.primary;
    if (!this.providerStatus.get(active) || !this.providerStatus.get(inactive)) return;

    const transition = checkHalfOpenTransition(
      this.circuitState,
      this.circuitStateTimestamp,
      this.config.failbackCooldownMs,
      this.providerStatus.get(this.config.primary)
    );
    if (transition.shouldTransition) {
      this.circuitState = CircuitState.HALF_OPEN;
      this.circuitStateTimestamp = Date.now();
    }

    setCircuitBreakerState(this.circuitState === CircuitState.OPEN);
  }

  private triggerFailover(reason: string): void {
    logger.error('FailoverManager: Triggering automatic failover', {
      fromProvider: this.config.primary,
      toProvider: this.config.secondary,
      reason,
    });
    switchActiveProvider(this.providerStatus, this.config.secondary);
    updateProviderStatus(this.providerStatus, this.config.secondary, ProviderHealthStatus.DEGRADED);
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
    const event = createFailoverEvent(fromProvider, toProvider, reason, triggeredBy);
    this.failoverHistory = appendFailoverEvent(this.failoverHistory, event, this.MAX_HISTORY);
    recordFailoverMetric(fromProvider, this.config.primary, reason, triggeredBy);
  }
}
