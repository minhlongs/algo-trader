/**
 * Polymarket Connector Types
 * Configuration options and parameters for Polymarket CLOB integration.
 */

import {
  type ExchangeBalance,
  type ExchangeOrderResult,
} from '../arbitrage/connectors/types';

export const DEFAULT_TERMINAL_CACHE_CAPACITY = 1000;
export const DEFAULT_TERMINAL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface TerminalCacheEntry {
  readonly order: ExchangeOrderResult;
  readonly cachedAt: number;
}

export interface PolymarketConnectorOptions {
  /** Order lifetime before expiration (seconds), default: 300 (5 min) */
  defaultExpirationSec?: number;
  /** Fee rate in BPS passed in EIP-712 order struct, default: 0 */
  defaultFeeRateBps?: number;
  /** Signature type (0: EOA, 1: PolyProxy, 2: PolyGnosisSafe), default: 0 */
  defaultSignatureType?: 0 | 1 | 2;
  /** Custom balance interrogation provider for test injection */
  balanceProvider?: () => Promise<ExchangeBalance>;
  /** Probe token ID for REST API latency checks */
  latencyProbeTokenId?: string;
  /** Simulated or default collateral balance in USD */
  defaultUsdcBalance?: number;
  /** Explicit dryRun flag; if set to false, enforces requireLiveEnabled() */
  dryRun?: boolean;
  /** Max capacity of terminal order cache (default: 1000) */
  terminalCacheCapacity?: number;
  /** TTL of entries in terminal order cache in milliseconds (default: 3_600_000, i.e. 1 hour) */
  terminalCacheTtlMs?: number;
}
