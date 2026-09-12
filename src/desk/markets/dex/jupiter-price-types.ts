/**
 * Jupiter Price Adapter Types & Constants
 */
import { type DexAdapterConfig } from './dex-types';

/** Jupiter Price API v2 — lightweight quote endpoint */
export const DEFAULT_JUPITER_API = 'https://api.jup.ag/price/v2';

/** USDC mint on Solana mainnet (used as default quote token) */
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Default timeout per request */
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Retries on transient HTTP errors */
export const DEFAULT_RETRIES = 2;

// ── Response types (mirrors Jupiter Price API v2 shape) ────────────────────────

export interface JupiterPriceResponse {
  type: 'quote';
  price: string; // decimal string, e.g. "0.00234"
  timeTaken: number;
}

export interface JupiterDataResponse {
  data?: Record<string, JupiterPriceResponse>;
}

export interface JupiterPriceConfig extends DexAdapterConfig {
  /** Override Jupiter API base URL */
  apiUrl?: string;
  /** HTTP request timeout in ms */
  timeoutMs?: number;
  /** Retry count on 429 / 5xx */
  retries?: number;
  /** Requested quote token mint (default USDC) */
  quoteMint?: string;
}
