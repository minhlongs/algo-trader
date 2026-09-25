/**
 * Polymarket Connector Types
 * Configuration options and parameters for Polymarket CLOB integration.
 */

import { type ExchangeBalance } from '../arbitrage/connectors/types';

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
}
