// SPDX-License-Identifier: MIT
/**
 * Provider Failover Types
 */

import {
  ProviderHealthStatus,
  MarketDataSource,
  ProviderFailoverConfig,
  FailoverEvent,
} from './types';

export {
  ProviderHealthStatus,
  MarketDataSource,
  ProviderFailoverConfig,
  FailoverEvent,
};

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',       // Normal operation, requests pass through
  OPEN = 'open',           // Failover active, primary blocked
  HALF_OPEN = 'half_open', // Testing if primary recovered
}

/**
 * Provider health snapshot
 */
export interface ProviderHealthSnapshot {
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
