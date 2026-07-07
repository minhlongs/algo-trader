/**
 * Qwen Live-Eligibility Gate
 * Enforces two hard gates before any Qwen signal can touch live money:
 *
 *   L4 — MIN_PAPER_DAYS=30 (hardcoded, not env-overridable)
 *        Checks SELECT MIN(created_at) FROM paper_trades_v3 WHERE source='qwen'
 *        If first trade < 30 days ago → reject with 403.
 *
 *   L4b — QWEN_AUTO_APPROVE_MAX_USD=500 (env, default 500)
 *         Trades > threshold require manual approval even after 30d.
 *
 * Additionally reads QWEN_LIVE_ELIGIBLE env flag (must be 'true' AND 30d cleared).
 */

import { query } from '../../shared/db/postgres-client';
import { logger } from '../utils/logger';
import { setQwenPaperGateDaysRemaining } from '../middleware/prometheus-metrics';

/** Hardcoded — MUST NOT be changed to env-configurable. */
const MIN_PAPER_DAYS = 30;
const MIN_PAPER_MS = MIN_PAPER_DAYS * 24 * 60 * 60 * 1000;

/** Auto-approve cap in USD — env-configurable, defaults to 500. */
function getMaxAutoApproveUsd(): number {
  const raw = process.env.QWEN_AUTO_APPROVE_MAX_USD;
  const parsed = raw ? parseFloat(raw) : 500;
  return isNaN(parsed) ? 500 : parsed;
}

export class PaperGateError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'PaperGateError';
  }
}

/** Result of eligibility check */
export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  firstTradeAgeMs?: number;
  requiresManualApproval?: boolean;
}

/**
 * Check if Qwen source has accumulated ≥30 days of paper history.
 * Returns the age in ms of the oldest paper_trades_v3 row with source='qwen'.
 * Returns null if no trades exist yet (gate fails).
 */
async function getQwenFirstTradeAgeMs(): Promise<number | null> {
  try {
    const result = await query<{ min_ts: number | null }>(
      `SELECT MIN(created_at) AS min_ts FROM paper_trades_v3 WHERE source = $1`,
      ['qwen']
    );
    const minTs = result.rows[0]?.min_ts;
    if (!minTs) return null;
    return Date.now() - minTs;
  } catch (err) {
    logger.warn('[QwenGate] DB query failed — treating as ineligible', { err });
    return null;
  }
}

/**
 * Check all eligibility gates for a Qwen signal going live.
 * Throws PaperGateError if any gate fails.
 *
 * @param sizeUsd - trade size in USD (for QWEN_AUTO_APPROVE_MAX_USD check)
 */
export async function assertQwenLiveEligible(sizeUsd: number): Promise<void> {
  // Gate: human must flip QWEN_LIVE_ELIGIBLE=true
  if (process.env.QWEN_LIVE_ELIGIBLE !== 'true') {
    throw new PaperGateError(
      'Qwen live trading not enabled. Set QWEN_LIVE_ELIGIBLE=true after 30-day paper validation.'
    );
  }

  // L4: 30-day hard gate
  const ageMs = await getQwenFirstTradeAgeMs();
  if (ageMs === null) {
    throw new PaperGateError(
      'No Qwen paper trades recorded. Cannot validate 30-day paper history.'
    );
  }
  if (ageMs < MIN_PAPER_MS) {
    const daysRemaining = ((MIN_PAPER_MS - ageMs) / (24 * 60 * 60 * 1000)).toFixed(1);
    throw new PaperGateError(
      `Qwen source requires ${MIN_PAPER_DAYS}d paper validation. ${daysRemaining}d remaining.`
    );
  }

  // L4b: USD size cap
  const maxUsd = getMaxAutoApproveUsd();
  if (sizeUsd > maxUsd) {
    throw new PaperGateError(
      `Qwen trade size $${sizeUsd.toFixed(2)} exceeds auto-approve limit $${maxUsd}. Manual approval required.`
    );
  }

  logger.info('[QwenGate] Live eligibility confirmed', { sizeUsd, ageMs });
}

/**
 * Non-throwing eligibility check — returns result object.
 * Used for status endpoints and monitoring.
 */
export async function checkQwenEligibility(sizeUsd = 0): Promise<EligibilityResult> {
  if (process.env.QWEN_LIVE_ELIGIBLE !== 'true') {
    return { eligible: false, reason: 'QWEN_LIVE_ELIGIBLE not set to true' };
  }

  const ageMs = await getQwenFirstTradeAgeMs();
  if (ageMs === null) {
    return { eligible: false, reason: 'No Qwen paper trades recorded' };
  }
  if (ageMs < MIN_PAPER_MS) {
    const daysRemaining = ((MIN_PAPER_MS - ageMs) / (24 * 60 * 60 * 1000)).toFixed(1);
    setQwenPaperGateDaysRemaining(parseFloat(daysRemaining));
    return {
      eligible: false,
      reason: `${daysRemaining}d remaining in paper validation window`,
      firstTradeAgeMs: ageMs,
    };
  }

  const maxUsd = getMaxAutoApproveUsd();
  if (sizeUsd > maxUsd) {
    return {
      eligible: true,
      requiresManualApproval: true,
      reason: `Size $${sizeUsd.toFixed(2)} exceeds auto-approve cap $${maxUsd}`,
      firstTradeAgeMs: ageMs,
    };
  }

  return { eligible: true, firstTradeAgeMs: ageMs };
}
