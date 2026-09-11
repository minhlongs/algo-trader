/**
 * Strategy-to-Live Bridge Types & Config
 * Data transfer objects for trade routing, live order responses, and scanner settings.
 */

import type { PolymarketOrderResponse } from '../execution/polymarket-adapter';

export interface TradeSignal {
  tokenId: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  /** Market/question description for logging */
  description?: string;
  /** Signal confidence (0-1), used for position sizing */
  confidence?: number;
  /** Signal generation timestamp (ms since epoch). Used for TTL validation. */
  timestamp: number;
}

export interface SignalResult {
  signal: TradeSignal;
  response: PolymarketOrderResponse | null;
  error: string | null;
  /** Whether the guard rejected this signal */
  rejected: boolean;
  rejectReason?: string;
}

export interface ScannerConfig {
  /** Capital in USDC for position sizing */
  capitalUsdc: number;
  /** Scan interval in milliseconds */
  scanIntervalMs: number;
  /** Minimum market volume to consider */
  minVolume: number;
  /** Max number of signals per scan cycle */
  maxSignalsPerScan: number;
  /** Price certainty threshold for endgame markets (>this or <1-this) */
  priceThreshold: number;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  capitalUsdc: 1000,
  scanIntervalMs: 30_000,
  minVolume: 10_000,
  maxSignalsPerScan: 3,
  priceThreshold: 0.95,
};
