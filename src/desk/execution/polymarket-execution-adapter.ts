/**
 * Polymarket Execution Adapter Builder
 *
 * Factory that wires PolymarketAdapter + PolymarketSigner for the trading pipeline.
 * PAPER mode (default): returns stub — no API keys needed, safe for development.
 * LIVE mode: validates env vars, creates real signer + adapter for CLOB API.
 *
 * Mode selection (priority high → low):
 *   1. config.paperTrading = false  → live
 *   2. POLYMARKET_TRADING_MODE=live + config.paperTrading unset → live
 *   3. default → paper
 *
 * Env vars required for LIVE: POLYMARKET_PRIVATE_KEY, POLYMARKET_API_KEY,
 * POLYMARKET_API_SECRET, POLYMARKET_PASSPHRASE
 * (deprecated POLY_* equivalents still accepted with warning)
 * Optional: POLY_CLOB_HOST, POLY_CHAIN_ID
 */

import { PolymarketAdapter } from './polymarket-adapter';
import { PolymarketSigner } from './polymarket-signer';
import { logger } from '../../shared/utils/logger';

// ── Config ────────────────────────────────────────────────────────────────────

export interface PolymarketExecutionConfig {
  /** PAPER (true) = safe simulation; LIVE (false) = real CLOB orders. Undefined = follow env var. */
  paperTrading?: boolean;
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

const LIVE_ENV_VARS: Array<{ newName: string; oldName: string }> = [
  { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY' },
  { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET' },
  { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE' },
  { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY' },
];

function missingLiveEnvVars(): string[] {
  return LIVE_ENV_VARS
    .filter(({ newName, oldName }) => !process.env[newName] && !process.env[oldName])
    .map(({ newName, oldName }) => `${newName} (or ${oldName})`);
}

function hasAllCredentials(): boolean {
  return missingLiveEnvVars().length === 0;
}

// ── Builder ────────────────────────────────────────────────────────────────────

/**
 * Build the Polymarket execution adapter.
 *
 * PAPER mode (default):
 *   Returns stub — no API keys needed. Safe for development and backtesting.
 *
 * LIVE mode:
 *   Validates all 4 env vars, creates PolymarketSigner + PolymarketAdapter.
 *   If credentials missing → warns and falls back to paper (safe default).
 *
 * @example
 *   // Paper (default)
 *   const exec = buildPolymarketAdapter({ paperTrading: true });
 *
 *   // Live via config flag
 *   const exec = buildPolymarketAdapter({ paperTrading: false });
 *
 *   // Live via env var (POLYMARKET_TRADING_MODE=live, config.paperTrading unset)
 *   const exec = buildPolymarketAdapter({});
 */
export function buildPolymarketAdapter(
  config: PolymarketExecutionConfig = {},
): PolymarketExecutionAdapter {
  const envTradingMode = process.env.POLYMARKET_TRADING_MODE || 'paper';
  const isLive = config.paperTrading === false
    || (config.paperTrading === undefined && envTradingMode === 'live');

  if (!isLive) {
    logger.debug('[PolymarketAdapter] PAPER mode — no API keys required');
    return { adapter: null, signer: null, paperTrading: true };
  }

  // LIVE mode — validate all env vars
  if (!hasAllCredentials()) {
    const missing = missingLiveEnvVars();
    logger.warn(
      `[PolymarketAdapter] POLYMARKET_TRADING_MODE=live but missing: ${missing.join(', ')} — falling back to PAPER`,
    );
    return { adapter: null, signer: null, paperTrading: true };
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
