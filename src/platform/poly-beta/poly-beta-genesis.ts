/**
 * POLY-G5 Public Beta — Atomic Genesis Portfolio & Ledger Provisioning Helper.
 */

import { INITIAL_VIRTUAL_CAPITAL_MICRO, type PolyBetaD1Database } from './poly-beta-types';
import { runAtomicBatch } from './poly-beta-ledger';

export async function provisionTenantGenesisLedger(
  db: PolyBetaD1Database,
  params: {
    userId: string;
    tenantId: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    sessionHash: string;
    csrfToken: string;
    inviteTokenHash: string;
    expiresAtMs: number;
    nowMs: number;
  },
): Promise<void> {
  const {
    userId,
    tenantId,
    email,
    passwordHash,
    passwordSalt,
    sessionHash,
    csrfToken,
    inviteTokenHash,
    expiresAtMs,
    nowMs,
  } = params;

  await runAtomicBatch(db, [
    db
      .prepare(
        `INSERT INTO beta_invite_redemptions (token_hash, email, user_id, tenant_id, redeemed_at_ms)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(inviteTokenHash, email, userId, tenantId, nowMs),
    db
      .prepare(
        `INSERT INTO beta_users (id, tenant_id, email, password_hash, password_salt, disclosure_ack, created_at_ms)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
      .bind(userId, tenantId, email, passwordHash, passwordSalt, nowMs),
    db
      .prepare(
        `INSERT INTO beta_portfolios (
           tenant_id, mode, initial_capital_micro, cash_balance_micro, realized_pnl_micro,
           settled_pnl_micro, fees_paid_micro, peak_equity_micro, max_drawdown_bps,
           selected_strategy_id, engine_state, updated_at_ms
         ) VALUES (?, 'PAPER', ?, ?, 0, 0, 0, ?, 0, 'toxicity-aware-mm-paper', 'STOPPED', ?)`,
      )
      .bind(tenantId, INITIAL_VIRTUAL_CAPITAL_MICRO, INITIAL_VIRTUAL_CAPITAL_MICRO, INITIAL_VIRTUAL_CAPITAL_MICRO, nowMs),
    db
      .prepare(
        `INSERT INTO beta_ledger_entries (
           entry_id, tenant_id, seq, entry_type, reference_id,
           cash_delta_micro, cash_after_micro, realized_delta_micro, settled_delta_micro,
           fee_micro, note, created_at_ms
         ) VALUES (?, ?, 1, 'GENESIS_GRANT', 'genesis-100-pusd', ?, ?, 0, 0, 0, ?, ?)`,
      )
      .bind(
        `led_${crypto.randomUUID()}`,
        tenantId,
        INITIAL_VIRTUAL_CAPITAL_MICRO,
        INITIAL_VIRTUAL_CAPITAL_MICRO,
        'Initial virtual paper capital grant ($100.00 simulated pUSD — $0 real funds)',
        nowMs,
      ),
    db
      .prepare(
        `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms)
         VALUES (?, ?, 'INFO', 'ACCOUNT_CREATED', 'Paper portfolio initialized with $100.00 simulated balance', ?)`,
      )
      .bind(`log_${crypto.randomUUID()}`, tenantId, nowMs),
    db
      .prepare(
        `INSERT INTO beta_sessions (session_hash, user_id, tenant_id, csrf_token, expires_at_ms, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(sessionHash, userId, tenantId, csrfToken, expiresAtMs, nowMs),
  ]);
}
