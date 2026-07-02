/**
 * Polymarket Execution Adapter Builder
 *
 * Factory that wires PolymarketAdapter + PolymarketSigner for the trading pipeline.
 * PAPER mode (default): returns stub — no API keys needed, safe for development.
 * LIVE mode: validates env vars, creates real signer + adapter for CLOB API.
 *
 * Env vars required for LIVE: POLYMARKET_API_KEY, POLYMARKET_API_SECRET,
 * POLYMARKET_PASSPHRASE, POLYMARKET_PRIVATE_KEY
 * (deprecated POLY_* equivalents still accepted with warning)
 * Optional: POLY_CLOB_HOST, POLY_CHAIN_ID
 */

import { PolymarketAdapter } from './polymarket-adapter';
import { PolymarketSigner } from './polymarket-signer';
import { logger } from '../../shared/utils/logger';

// ── Config ────────────────────────────────────────────────────────────────────

export interface PolymarketExecutionConfig {
  /** PAPER (true) = safe simulation; LIVE (false) = real CLOB orders */
  paperTrading: boolean;
  /** Polymarket chain ID (default: 137 = Polygon mainnet) */
  chainId?: number;
  /** CLOB API base URL (default: https://clob.polymarket.com) */
  apiUrl?: string;
}

// ── Return type ────────────────────────────────────────────────────────────────

export interface PolymarketExecutionAdapter {
  /** Real CLOB adapter — null in PAPER mode */
  adapter: PolymarketAdapter | null;
  /** ECDSA signer for order EIP-712 signing — null in PAPER mode */
  signer: PolymarketSigner | null;
  /** Whether we are in paper trading mode */
  paperTrading: boolean;
}

// ── Env var resolution (POLYMARKET_* preferred, POLY_* fallback) ──────────────

function resolveEnvVar(newName: string, oldName: string): string | undefined {
  const newVal = process.env[newName];
  if (newVal) return newVal;
  const oldVal = process.env[oldName];
  if (oldVal) {
    logger.warn(`[PolymarketAdapter] Deprecated env var ${oldName} used — switch to ${newName}`);
    return oldVal;
  }
  return undefined;
}

function resolvePrivateKey(): string | undefined {
  return resolveEnvVar('POLYMARKET_PRIVATE_KEY', 'POLY_PRIVATE_KEY');
}

// ── Required env vars for LIVE mode ────────────────────────────────────────────

const LIVE_ENV_VARS_NEW: Array<{ newName: string; oldName: string }> = [
  { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY' },
  { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET' },
  { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE' },
  { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY' },
];

function validateLiveEnvVars(): string[] {
  return LIVE_ENV_VARS_NEW
    .filter(({ newName, oldName }) => !process.env[newName] && !process.env[oldName])
    .map(({ newName, oldName }) => `${newName} (or ${oldName})`);
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Build the Polymarket execution adapter.
 *
 * PAPER mode (paperTrading: true):
 *   Returns stub — no API keys needed. Safe for development and backtesting.
 *
 * LIVE mode (paperTrading: false):
 *   Validates all 4 env vars, creates PolymarketSigner + PolymarketAdapter.
 *   Throws with clear guidance if any env var is missing.
 *
 * @example
 *   // Paper (default)
 *   const exec = buildPolymarketAdapter({ paperTrading: true });
 *
 *   // Live
 *   const exec = buildPolymarketAdapter({ paperTrading: false });
 */
export function buildPolymarketAdapter(
  config: PolymarketExecutionConfig,
): PolymarketExecutionAdapter {
  const paperTrading = config.paperTrading ?? true;

  if (paperTrading) {
    logger.info('[PolymarketAdapter] PAPER mode — no API keys required');
    return { adapter: null, signer: null, paperTrading: true };
  }

  // LIVE mode — validate all env vars
  const missing = validateLiveEnvVars();
  if (missing.length > 0) {
    const msg =
      `Cannot start LIVE trading. Missing env vars: ${missing.join(', ')}. ` +
      'Set POLYMARKET_API_KEY, POLYMARKET_API_SECRET, POLYMARKET_PASSPHRASE, POLYMARKET_PRIVATE_KEY ' +
      '(or the deprecated POLY_* equivalents) in your .env file, or run in PAPER mode (paperTrading: true).';
    logger.error(msg, 'PolymarketAdapter');
    throw new Error(msg);
  }

  const privateKey = resolvePrivateKey()!;
  const chainId = config.chainId ?? parseInt(process.env.POLY_CHAIN_ID || '137', 10);
  const apiUrl = config.apiUrl ?? (process.env.POLY_CLOB_HOST || 'https://clob.polymarket.com');

  // PolymarketSigner validates key format — throws on paper/placeholder keys
  const signer = new PolymarketSigner(privateKey, chainId);
  const adapter = new PolymarketAdapter(signer, apiUrl);

  logger.info(
    `[PolymarketAdapter] LIVE mode — signer ${signer.getAddress().slice(0, 10)}... on chain ${chainId} @ ${apiUrl}`,
  );

  return { adapter, signer, paperTrading: false };
}
