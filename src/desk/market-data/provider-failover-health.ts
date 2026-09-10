// SPDX-License-Identifier: MIT
/**
 * Provider Failover Health Helpers
 * Pure health status calculations and state switching logic
 */

import { logger } from '../../shared/utils/logger';
import {
  ProviderHealthStatus,
  MarketDataSource,
  ProviderHealthSnapshot,
  CircuitState,
} from './provider-failover-types';

export function calculateHealthStatus(
  snapshot: ProviderHealthSnapshot,
  failureThreshold: number
): ProviderHealthStatus {
  if (snapshot.consecutiveFailures >= failureThreshold) {
    return ProviderHealthStatus.UNHEALTHY;
  }
  if (snapshot.consecutiveFailures > 0) {
    return ProviderHealthStatus.DEGRADED;
  }
  return ProviderHealthStatus.HEALTHY;
}

export function updateProviderStatus(
  providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>,
  provider: MarketDataSource,
  newStatus: ProviderHealthStatus
): void {
  const snapshot = providerStatus.get(provider);
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

export function switchActiveProvider(
  providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>,
  newActive: MarketDataSource
): boolean {
  let switched = false;
  for (const [provider, snapshot] of providerStatus) {
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

export function initializeProviderStatus(
  primary: MarketDataSource,
  secondary: MarketDataSource
): Map<MarketDataSource, ProviderHealthSnapshot> {
  const map = new Map<MarketDataSource, ProviderHealthSnapshot>();
  const createSnap = (provider: MarketDataSource, isPrimary: boolean, isActive: boolean): ProviderHealthSnapshot => ({
    provider,
    status: ProviderHealthStatus.HEALTHY,
    consecutiveFailures: 0,
    isActive,
    isPrimary,
    lastSuccess: Date.now(),
    lastFailure: 0,
    avgLatency: 0,
    requestCount: 0,
  });
  map.set(primary, createSnap(primary, true, true));
  map.set(secondary, createSnap(secondary, false, false));
  return map;
}

export function checkHalfOpenTransition(
  circuitState: CircuitState,
  circuitStateTimestamp: number,
  failbackCooldownMs: number,
  primarySnapshot?: ProviderHealthSnapshot
): { shouldTransition: boolean } {
  if (circuitState === CircuitState.OPEN && Date.now() - circuitStateTimestamp >= failbackCooldownMs) {
    logger.info('Entering HALF_OPEN state to test primary recovery');
    if (primarySnapshot) primarySnapshot.isActive = true;
    return { shouldTransition: true };
  }
  return { shouldTransition: false };
}
