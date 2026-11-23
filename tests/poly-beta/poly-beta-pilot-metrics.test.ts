import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertReadOnlySelectSql,
  computePilotMetricsFromD1Json,
  computePilotMetricsFromSqlite,
  computePilotMetricsFromWranglerD1,
  parseCliArgs,
} from '../../scripts/poly-beta-pilot-metrics.mjs';

const WORKTREE_ROOT = resolve(__dirname, '../..');
const MIGRATION_0001 = readFileSync(
  join(WORKTREE_ROOT, 'migrations/poly-beta-d1/0001-poly-beta-ledger.sql'),
  'utf8',
);
const MIGRATION_0002 = readFileSync(
  join(WORKTREE_ROOT, 'migrations/poly-beta-d1/0002-poly-beta-invite-redemptions.sql'),
  'utf8',
);
const MIGRATION_0003_FALLBACK = `
CREATE TABLE IF NOT EXISTS beta_feedback (
  feedback_id   TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  category      TEXT NOT NULL,
  message       TEXT NOT NULL,
  screen_id     TEXT,
  app_version   TEXT,
  status        TEXT NOT NULL DEFAULT 'OPEN',
  created_at_ms INTEGER NOT NULL
);
`;

describe('poly-beta-pilot-metrics', () => {
  let tempDir: string;
  let sqlitePath: string;

  const windowStartIso = '2026-11-16T00:00:00.000Z';
  const windowEndIso = '2026-11-23T00:00:00.000Z';
  const inWindowDay1 = Date.parse('2026-11-17T10:00:00.000Z');
  const inWindowDay2 = Date.parse('2026-11-18T14:30:00.000Z');
  const outOfWindowMs = Date.parse('2026-11-10T10:00:00.000Z');

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'poly-beta-metrics-'));
    sqlitePath = join(tempDir, 'pilot.sqlite');
    const db = new DatabaseSync(sqlitePath);
    db.exec(MIGRATION_0001);
    db.exec(MIGRATION_0002);
    db.exec(MIGRATION_0003_FALLBACK);

    // Seed 2 in-window users + 1 out-of-window user (with sensitive PII fields)
    db.prepare(
      `INSERT INTO beta_users (id, tenant_id, email, password_hash, password_salt, disclosure_ack, created_at_ms)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).run('usr_secret_1', 'ten_secret_1', 'alice.pilot@example.com', 'hash_alice_pw', 'salt_1', inWindowDay1);
    db.prepare(
      `INSERT INTO beta_users (id, tenant_id, email, password_hash, password_salt, disclosure_ack, created_at_ms)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).run('usr_secret_2', 'ten_secret_2', 'bob.pilot@example.com', 'hash_bob_pw', 'salt_2', inWindowDay2);
    db.prepare(
      `INSERT INTO beta_users (id, tenant_id, email, password_hash, password_salt, disclosure_ack, created_at_ms)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).run('usr_old', 'ten_old', 'old.user@example.com', 'hash_old_pw', 'salt_old', outOfWindowMs);

    // Invite redemptions (2 in window, 1 out of window)
    db.prepare(
      `INSERT INTO beta_invite_redemptions (token_hash, email, user_id, tenant_id, redeemed_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('tokhash_secret_1', 'alice.pilot@example.com', 'usr_secret_1', 'ten_secret_1', inWindowDay1);
    db.prepare(
      `INSERT INTO beta_invite_redemptions (token_hash, email, user_id, tenant_id, redeemed_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('tokhash_secret_2', 'bob.pilot@example.com', 'usr_secret_2', 'ten_secret_2', inWindowDay2);
    db.prepare(
      `INSERT INTO beta_invite_redemptions (token_hash, email, user_id, tenant_id, redeemed_at_ms)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('tokhash_old', 'old.user@example.com', 'usr_old', 'ten_old', outOfWindowMs);

    // Sessions (both in-window tenants logged in on day1/day2)
    db.prepare(
      `INSERT INTO beta_sessions (session_hash, user_id, tenant_id, csrf_token, expires_at_ms, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('sesshash_1', 'usr_secret_1', 'ten_secret_1', 'csrf_1', inWindowDay1 + 3600_000, inWindowDay1);
    db.prepare(
      `INSERT INTO beta_sessions (session_hash, user_id, tenant_id, csrf_token, expires_at_ms, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('sesshash_2', 'usr_secret_2', 'ten_secret_2', 'csrf_2', inWindowDay2 + 3600_000, inWindowDay2);

    // Execution logs: 1 tenant started strategy, 2 RISK_BLOCK, 1 HALT, 1 out-of-window HALT
    db.prepare(
      `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('log_1', 'ten_secret_1', 'INFO', 'STRATEGY_START', 'started', inWindowDay1);
    db.prepare(
      `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('log_2', 'ten_secret_1', 'RISK_BLOCK', 'MAX_POSITION', 'blocked', inWindowDay1 + 1000);
    db.prepare(
      `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('log_3', 'ten_secret_1', 'RISK_BLOCK', 'MAX_NOTIONAL', 'blocked', inWindowDay2);
    db.prepare(
      `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('log_4', 'ten_secret_2', 'HALT', 'DRAWDOWN_HALT', 'halted', inWindowDay2);
    db.prepare(
      `INSERT INTO beta_execution_logs (log_id, tenant_id, level, event_code, detail, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('log_old', 'ten_old', 'HALT', 'OLD_HALT', 'old', outOfWindowMs);

    // Orders: 2 FILLED, 1 PENDING, 1 REJECTED, 1 CANCELLED in window + 1 FILLED out of window
    const insertOrder = db.prepare(
      `INSERT INTO beta_orders (
        order_id, tenant_id, idempotency_key, strategy_id, market_id, token_id,
        market_question, outcome, side, price_micro, size_shares_micro, filled_shares_micro,
        fee_micro, status, reject_reason, model_assumption, source_timestamp_ms, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, 'strat', 'mkt1', 'tok1', 'Q?', 'YES', 'BUY', 500000, 1000000, 0, 0, ?, NULL, 'paper', ?, ?, ?)`,
    );
    insertOrder.run('ord_1', 'ten_secret_1', 'idem_1', 'FILLED', inWindowDay1, inWindowDay1, inWindowDay1);
    insertOrder.run('ord_2', 'ten_secret_1', 'idem_2', 'FILLED', inWindowDay1, inWindowDay1, inWindowDay1);
    insertOrder.run('ord_3', 'ten_secret_1', 'idem_3', 'PENDING', inWindowDay2, inWindowDay2, inWindowDay2);
    insertOrder.run('ord_4', 'ten_secret_2', 'idem_4', 'REJECTED', inWindowDay2, inWindowDay2, inWindowDay2);
    insertOrder.run('ord_5', 'ten_secret_2', 'idem_5', 'CANCELLED', inWindowDay2, inWindowDay2, inWindowDay2);
    insertOrder.run('ord_old', 'ten_old', 'idem_old', 'FILLED', outOfWindowMs, outOfWindowMs, outOfWindowMs);

    // Portfolios
    db.prepare(
      `INSERT INTO beta_portfolios (
        tenant_id, mode, initial_capital_micro, cash_balance_micro,
        realized_pnl_micro, settled_pnl_micro, fees_paid_micro,
        peak_equity_micro, max_drawdown_bps, updated_at_ms
      ) VALUES (?, 'PAPER', 100000000, 101000000, ?, ?, ?, 102000000, ?, ?)`,
    ).run('ten_secret_1', 1500000, 500000, 20000, 120, inWindowDay2);
    db.prepare(
      `INSERT INTO beta_portfolios (
        tenant_id, mode, initial_capital_micro, cash_balance_micro,
        realized_pnl_micro, settled_pnl_micro, fees_paid_micro,
        peak_equity_micro, max_drawdown_bps, updated_at_ms
      ) VALUES (?, 'PAPER', 100000000, 99500000, ?, ?, ?, 100000000, ?, ?)`,
    ).run('ten_secret_2', -500000, 0, 10000, 350, inWindowDay2);

    // Feedback (with raw message that must NEVER appear in output)
    db.prepare(
      `INSERT INTO beta_feedback (feedback_id, tenant_id, user_id, category, message, screen_id, app_version, status, created_at_ms)
       VALUES (?, ?, ?, ?, ?, 'trade', '0.1.0', 'OPEN', ?)`,
    ).run('fb_1', 'ten_secret_1', 'usr_secret_1', 'bug', 'RAW_SECRET_FEEDBACK_TEXT_DO_NOT_LEAK', inWindowDay1);
    db.prepare(
      `INSERT INTO beta_feedback (feedback_id, tenant_id, user_id, category, message, screen_id, app_version, status, created_at_ms)
       VALUES (?, ?, ?, ?, ?, 'trade', '0.1.0', 'OPEN', ?)`,
    ).run('fb_2', 'ten_secret_2', 'usr_secret_2', 'ux', 'ANOTHER_PRIVATE_COMMENT', inWindowDay2);

    db.close();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('computes exact read-only metrics, denominators, UTC windowing, and zero PII leakage', () => {
    const report = computePilotMetricsFromSqlite(sqlitePath, {
      windowStartIso,
      windowEndIso,
      deployedVersion: 'v0.9.0-pilot',
      invitationsIssued: 4,
      apiRequestsTotal: 200,
      apiErrorsTotal: 4,
      userVisibleErrors: 1,
    });

    expect(report.readOnly).toBe(true);
    expect(report.deployedVersion).toBe('v0.9.0-pilot');
    expect(report.window).toEqual({ startUtc: windowStartIso, endUtc: windowEndIso });

    const m = report.metrics;
    expect(m.invitationsIssued).toBe(4);
    expect(m.successfulInviteRedemptions).toBe(2);
    expect(m.signupCompletion).toEqual({ numerator: 2, denominator: 4, rate: 0.5 });
    expect(m.firstSuccessfulLogin).toEqual({ numerator: 2, denominator: 2, rate: 1 });
    expect(m.firstSuccessfulPaperStrategyActivation).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(m.simulatedOrderAttempts).toBe(5);
    expect(m.acceptedPaperOrders).toBe(3);
    expect(m.rejectedPaperOrders).toBe(1);
    expect(m.riskGateRejections).toBe(2);
    expect(m.haltedEvents).toBe(1);
    expect(m.apiErrorRate).toEqual({ numerator: 4, denominator: 200, rate: 0.02 });
    expect(m.userVisibleErrors).toBe(1);
    expect(m.feedbackSubmissions).toEqual({ total: 2, byCategory: { bug: 1, ux: 1 } });
    expect(m.dailyActiveSessions).toEqual([
      { utcDate: '2026-11-17', activeTenantCount: 1 },
      { utcDate: '2026-11-18', activeTenantCount: 2 },
    ]);
    expect(m.simulatedPortfolioSummary).toEqual({
      label: 'SIMULATED_PAPER_ONLY_NOT_REAL_PNL',
      portfolioCount: 2,
      realizedPnlMicro: 1000000,
      settledPnlMicro: 500000,
      feesPaidMicro: 30000,
      maxDrawdownBps: 350,
    });
    expect(report.opcUnitEconomics.virtualBalanceNotRevenue).toBe(true);
    expect(report.opcUnitEconomics.separateFromMakerAlpha).toBe(true);

    const serialized = JSON.stringify(report);
    for (const forbidden of [
      'alice.pilot@example.com',
      'bob.pilot@example.com',
      'usr_secret_1',
      'ten_secret_1',
      'hash_alice_pw',
      'tokhash_secret_1',
      'sesshash_1',
      'RAW_SECRET_FEEDBACK_TEXT_DO_NOT_LEAK',
      'ANOTHER_PRIVATE_COMMENT',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('preserves UNKNOWN when optional external inputs or optional tables are absent', () => {
    const minimalSqlite = join(tempDir, 'minimal.sqlite');
    const db = new DatabaseSync(minimalSqlite);
    db.exec(MIGRATION_0001);
    db.close();

    const report = computePilotMetricsFromSqlite(minimalSqlite, {
      windowStartIso,
      windowEndIso,
    });

    expect(report.deployedVersion).toBe('UNKNOWN');
    expect(report.metrics.invitationsIssued).toBe('UNKNOWN');
    expect(report.metrics.successfulInviteRedemptions).toBe('UNKNOWN');
    expect(report.metrics.signupCompletion).toEqual({
      numerator: 0,
      denominator: 'UNKNOWN',
      rate: 'UNKNOWN',
    });
    expect(report.metrics.apiErrorRate).toEqual({
      numerator: 'UNKNOWN',
      denominator: 'UNKNOWN',
      rate: 'UNKNOWN',
    });
    expect(report.metrics.userVisibleErrors).toBe('UNKNOWN');
    expect(report.metrics.feedbackSubmissions).toBe('UNKNOWN');
  });

  it('supports read-only --d1-json snapshot and validates --wrangler-d1 SELECT-only guard', () => {
    const snapshotPath = join(tempDir, 'snapshot.json');
    writeFileSync(
      snapshotPath,
      JSON.stringify({
        aggregates: {
          signups: 3,
          successfulInviteRedemptions: 3,
          firstSuccessfulLoginCount: 2,
          firstSuccessfulPaperStrategyActivationCount: 1,
          simulatedOrderAttempts: 10,
          acceptedPaperOrders: 8,
          rejectedPaperOrders: 2,
          riskGateRejections: 2,
          haltedEvents: 0,
          feedbackSubmissions: { total: 1, byCategory: { bug: 1 } },
          dailyActiveSessions: [{ utcDate: '2026-11-17', activeTenantCount: 2 }],
          simulatedPortfolioSummary: {
            portfolioCount: 3,
            realizedPnlMicro: 0,
            settledPnlMicro: 0,
            feesPaidMicro: 0,
            maxDrawdownBps: 50,
          },
        },
      }),
      'utf8',
    );

    const jsonReport = computePilotMetricsFromD1Json(snapshotPath, {
      windowStartIso,
      windowEndIso,
      invitationsIssued: 5,
    });
    expect(jsonReport.source).toBe('d1-json');
    expect(jsonReport.metrics.signupCompletion).toEqual({
      numerator: 3,
      denominator: 5,
      rate: 0.6,
    });
    expect(jsonReport.metrics.simulatedPortfolioSummary.label).toBe(
      'SIMULATED_PAPER_ONLY_NOT_REAL_PNL',
    );

    expect(() => assertReadOnlySelectSql('DELETE FROM beta_users')).toThrow(/SELECT/);
    expect(() => assertReadOnlySelectSql('SELECT 1; DROP TABLE beta_users')).toThrow(
      /Multi-statement/,
    );
    expect(assertReadOnlySelectSql('SELECT COUNT(*) AS cnt FROM beta_users')).toMatch(/^SELECT/);

    const seenCommands: string[] = [];
    const wranglerReport = computePilotMetricsFromWranglerD1(
      'poly-beta-db',
      { windowStartIso, windowEndIso },
      (args: string[]) => {
        const sql = args[args.length - 1];
        seenCommands.push(sql);
        return JSON.stringify([{ results: [{ cnt: 1, total: 2, accepted: 1, rejected: 1 }] }]);
      },
    );
    expect(wranglerReport.source).toBe('wrangler-d1');
    expect(seenCommands.length).toBeGreaterThan(0);
    for (const sql of seenCommands) {
      expect(sql.startsWith('SELECT')).toBe(true);
    }
  });

  it('parses CLI args and rejects invalid windows or negative counts', () => {
    const parsed = parseCliArgs([
      '--sqlite',
      sqlitePath,
      '--window-start',
      windowStartIso,
      '--window-end',
      windowEndIso,
      '--invitations-issued',
      '10',
    ]);
    expect(parsed.invitationsIssued).toBe(10);
    expect(parsed.windowStartIso).toBe(windowStartIso);

    expect(() =>
      parseCliArgs([
        '--sqlite',
        sqlitePath,
        '--window-start',
        windowEndIso,
        '--window-end',
        windowStartIso,
      ]),
    ).toThrow(/--window-start/);

    expect(() => parseCliArgs(['--sqlite', sqlitePath, '--invitations-issued', '-1'])).toThrow(
      /non-negative integer/,
    );
  });
});
