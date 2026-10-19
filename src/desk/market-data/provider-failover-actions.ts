/**
 * Failover manager health check loop and actions.
 *
 * @module desk/market-data/provider-failover-actions
 */

import { logger } from '../../shared/utils/logger';
import {
  ProviderHealthStatus,
  MarketDataSource,
  CircuitState,
  ProviderHealthSnapshot,
  FailoverEvent,
} from './provider-failover-types';
import {
  createFailoverEvent,
  recordFailoverMetric,
  appendFailoverEvent,
} from './provider-failover-events';
import {
  switchActiveProvider,
  updateProviderStatus,
} from './provider-failover-health';

export function executeFailoverTransition(params: {
  providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>;
  primary: MarketDataSource;
  secondary: MarketDataSource;
  reason: string;
  triggeredBy: 'automatic' | 'manual';
  maxHistory: number;
  currentHistory: FailoverEvent[];
}): { newCircuitState: CircuitState; newTimestamp: number; updatedHistory: FailoverEvent[] } {
  const { providerStatus, primary, secondary, reason, triggeredBy, maxHistory, currentHistory } = params;

  if (triggeredBy === 'automatic') {
    logger.error('FailoverManager: Triggering automatic failover', {
      fromProvider: primary,
      toProvider: secondary,
      reason,
    });
  }

  switchActiveProvider(providerStatus, secondary);
  updateProviderStatus(providerStatus, secondary, ProviderHealthStatus.DEGRADED);

  const event = createFailoverEvent(primary, secondary, reason, triggeredBy);
  const updatedHistory = appendFailoverEvent(currentHistory, event, maxHistory);
  recordFailoverMetric(primary, primary, reason, triggeredBy);

  return {
    newCircuitState: CircuitState.OPEN,
    newTimestamp: Date.now(),
    updatedHistory,
  };
}

export function executeFailbackTransition(params: {
  providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>;
  primary: MarketDataSource;
  secondary: MarketDataSource;
  reason: string;
  maxHistory: number;
  currentHistory: FailoverEvent[];
}): { success: boolean; newCircuitState?: CircuitState; newTimestamp?: number; updatedHistory?: FailoverEvent[] } {
  const { providerStatus, primary, secondary, reason, maxHistory, currentHistory } = params;
  const secondarySnapshot = providerStatus.get(secondary);
  if (!secondarySnapshot || secondarySnapshot.status === ProviderHealthStatus.UNHEALTHY) {
    logger.warn('Failback blocked: secondary unhealthy', { provider: secondary, status: secondarySnapshot?.status });
    return { success: false };
  }
  const success = switchActiveProvider(providerStatus, primary);
  if (success) {
    const event = createFailoverEvent(secondary, primary, reason, 'manual');
    const updatedHistory = appendFailoverEvent(currentHistory, event, maxHistory);
    recordFailoverMetric(secondary, primary, reason, 'manual');
    return {
      success: true,
      newCircuitState: CircuitState.CLOSED,
      newTimestamp: Date.now(),
      updatedHistory,
    };
  }
  return { success: false };
}

export function executeForceFailover(params: {
  providerStatus: Map<MarketDataSource, ProviderHealthSnapshot>;
  primary: MarketDataSource;
  secondary: MarketDataSource;
  reason: string;
  maxHistory: number;
  currentHistory: FailoverEvent[];
}): { success: boolean; newCircuitState?: CircuitState; newTimestamp?: number; updatedHistory?: FailoverEvent[] } {
  const { providerStatus, primary, secondary, reason, maxHistory, currentHistory } = params;
  const success = switchActiveProvider(providerStatus, secondary);
  updateProviderStatus(providerStatus, secondary, ProviderHealthStatus.DEGRADED);
  if (success) {
    const event = createFailoverEvent(primary, secondary, reason, 'manual');
    const updatedHistory = appendFailoverEvent(currentHistory, event, maxHistory);
    recordFailoverMetric(primary, primary, reason, 'manual');
    return {
      success: true,
      newCircuitState: CircuitState.OPEN,
      newTimestamp: Date.now(),
      updatedHistory,
    };
  }
  return { success: false };
}


