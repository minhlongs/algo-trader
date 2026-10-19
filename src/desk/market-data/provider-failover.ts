// SPDX-License-Identifier: MIT
/**
 * Provider Failover Manager
 * Automatic failover with circuit breaker pattern
 */

import {
  ProviderHealthStatus,
  MarketDataSource,
  ProviderFailoverConfig,
  FailoverEvent,
  CircuitState,
  ProviderHealthSnapshot,
} from './provider-failover-types';
import {
  resolveFailoverConfig,
  applyRequestResultSnapshot,
  initializeProviderStatus,
  checkHalfOpenTransition,
} from './provider-failover-health';
import { executeFailoverTransition, executeFailbackTransition, executeForceFailover } from './provider-failover-actions';
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
    this.config = resolveFailoverConfig(config);
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
    if (!this.providerStatus.has(activeProvider)) return;

    this.slaTracker.recordRequest(activeProvider, success, latencyMs);
    const snapshot = applyRequestResultSnapshot(
      this.providerStatus, activeProvider, success, latencyMs, this.config.failureThreshold
    );

    if (snapshot && !success && this.circuitState === CircuitState.CLOSED && snapshot.consecutiveFailures >= this.config.failureThreshold) {
      this.triggerFailover(`Consecutive failures: ${snapshot.consecutiveFailures}`);
    }
  }

  async forceFailover(reason: string): Promise<boolean> {
    if (this.getActiveProvider() === this.config.secondary) return false;
    const res = executeForceFailover({
      providerStatus: this.providerStatus, primary: this.config.primary, secondary: this.config.secondary,
      reason, maxHistory: this.MAX_HISTORY, currentHistory: this.failoverHistory,
    });
    if (res.success && res.newCircuitState !== undefined) {
      this.circuitState = res.newCircuitState;
      this.circuitStateTimestamp = res.newTimestamp!;
      this.failoverHistory = res.updatedHistory!;
    }
    return res.success;
  }

  async forceFailback(reason: string): Promise<boolean> {
    if (this.getActiveProvider() === this.config.primary) return false;
    const res = executeFailbackTransition({
      providerStatus: this.providerStatus, primary: this.config.primary, secondary: this.config.secondary,
      reason, maxHistory: this.MAX_HISTORY, currentHistory: this.failoverHistory,
    });
    if (res.success && res.newCircuitState !== undefined) {
      this.circuitState = res.newCircuitState;
      this.circuitStateTimestamp = res.newTimestamp!;
      this.failoverHistory = res.updatedHistory!;
    }
    return res.success;
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
      this.circuitState, this.circuitStateTimestamp, this.config.failbackCooldownMs, this.providerStatus.get(this.config.primary)
    );
    if (transition.shouldTransition) {
      this.circuitState = CircuitState.HALF_OPEN;
      this.circuitStateTimestamp = Date.now();
    }

    setCircuitBreakerState(this.circuitState === CircuitState.OPEN);
  }

  private triggerFailover(reason: string): void {
    const res = executeFailoverTransition({
      providerStatus: this.providerStatus, primary: this.config.primary, secondary: this.config.secondary,
      reason, triggeredBy: 'automatic', maxHistory: this.MAX_HISTORY, currentHistory: this.failoverHistory,
    });
    this.circuitState = res.newCircuitState;
    this.circuitStateTimestamp = res.newTimestamp;
    this.failoverHistory = res.updatedHistory;
  }
}
