/**
 * Live Trading Orchestrator — Types, Config, and Env Validation
 *
 * Extracted from live-trading-orchestrator.ts for modularity.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Env-var validation (Zod)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Env-var validation
// ---------------------------------------------------------------------------

const REQUIRED_LIVE_VARS: Array<{ envKey: string; legacyKey: string; label: string }> = [
  { envKey: 'POLYMARKET_API_KEY', legacyKey: 'POLY_API_KEY', label: 'Polymarket API Key' },
  { envKey: 'POLYMARKET_API_SECRET', legacyKey: 'POLY_API_SECRET', label: 'Polymarket API Secret' },
  { envKey: 'POLYMARKET_PASSPHRASE', legacyKey: 'POLY_PASSPHRASE', label: 'Polymarket Passphrase' },
  { envKey: 'POLYMARKET_ETH_ADDRESS', legacyKey: 'POLY_ETH_ADDRESS', label: 'Polymarket ETH Address' },
];

function validateLiveEnv(): void {
  const missing: string[] = [];
  for (const v of REQUIRED_LIVE_VARS) {
    const val = process.env[v.envKey] ?? process.env[v.legacyKey] ?? '';
    if (!val) missing.push(`${v.label} (${v.envKey} or ${v.legacyKey})`);
  }
  if (missing.length > 0) {
    throw new Error(
      `LIVE mode requires all Polymarket API env vars:\n  ${missing.join('\n  ')}\n` +
      'Set them in your .env or use PAPER_MODE=true for paper trading.',
    );
  }
}

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

/**
 * LiveTradingConfig — original interface from the orchestrator.
 * Extends PolymarketExecutionConfig for adapter fields (paperTrading, chainId, apiUrl, etc.).
 */
export interface LiveTradingConfig {
  /** Run in paper mode (no real orders). Default: true. */
  paperTrading?: boolean;
  /** Total capital allocated for live trading (USDC). Required. */
  capitalUsdc: number;
  /** Max position fraction (default: 0.02 = 2%). */
  maxPositionFraction?: number;
  /** Max daily drawdown (default: 0.05 = 5%). */
  maxDailyDrawdown?: number;
  /** Max concurrent positions (default: 10). */
  maxConcurrentPositions?: number;
  /** Max consecutive losses before circuit trip (default: 3). */
  maxConsecutiveLosses?: number;
  /** Chain ID for Polymarket. */
  chainId?: number;
  /** Custom API URL override. */
  apiUrl?: string;
}

// ---------------------------------------------------------------------------
// Risk limits
// ---------------------------------------------------------------------------

export interface RiskLimits {
  /** Max portfolio allocation % (0-1). */
  maxAllocationPct: number;
  /** Max single position size in USDC. */
  maxPositionUsdc: number;
  /** Max daily loss in USDC before halt. */
  maxDailyLossUsdc: number;
  /** Max drawdown % (0-1) from equity peak. */
  maxDrawdownPct: number;
  /** Cooldown between trades in ms. */
  tradeCooldownMs: number;
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxAllocationPct: 0.25,
  maxPositionUsdc: 500,
  maxDailyLossUsdc: 100,
  maxDrawdownPct: 0.1,
  tradeCooldownMs: 30_000,
};

// ---------------------------------------------------------------------------
// Orchestrator status
// ---------------------------------------------------------------------------

export type OrchestratorStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

// ---------------------------------------------------------------------------
// Paper trade stats
// ---------------------------------------------------------------------------

export interface PaperTradeStats {
  paperTrades: number;
  paperPnl: number;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { validateLiveEnv };
