#!/usr/bin/env node
/**
 * Read-Only Pilot Telemetry Aggregator for 7-Day Paper Beta (`poly-beta-api`).
 *
 * Strictly read-only:
 *   - `--sqlite <path>` opens SQLite with `{ readOnly: true }`.
 *   - `--d1-json <path>` reads a pre-exported JSON snapshot.
 *   - `--wrangler-d1 <db-name>` executes ONLY validated `SELECT` statements.
 *
 * Privacy & Safety:
 *   - NEVER outputs emails, tokens, token hashes, password hashes, session hashes,
 *     user IDs, tenant IDs, or raw feedback text.
 *   - Requires zero wallet credentials.
 *   - Simulated portfolio metrics are explicitly labeled `SIMULATED_PAPER_ONLY_NOT_REAL_PNL`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FORBIDDEN_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;

function parseNonNegativeInt(raw, flagName) {
  if (raw === undefined) return 'UNKNOWN';
  if (!/^\d+$/.test(String(raw))) {
    throw new Error(`${flagName} must be a non-negative integer, received: ${raw}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} must be a safe non-negative integer, received: ${raw}`);
  }
  return parsed;
}

function parseIsoUtc(raw, flagName) {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new Error(`${flagName} must be a valid ISO-8601 UTC timestamp, received: ${raw}`);
  }
  return { iso: new Date(ms).toISOString(), ms };
}

export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const getFlag = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const sqlitePath = getFlag('--sqlite');
  const d1JsonPath = getFlag('--d1-json');
  const wranglerD1 = getFlag('--wrangler-d1');
  const wranglerConfig = getFlag('--wrangler-config') ?? 'wrangler.poly-beta.toml';

  const nowMs = Date.now();
  const windowEndRaw = getFlag('--window-end') ?? new Date(nowMs).toISOString();
  const windowEnd = parseIsoUtc(windowEndRaw, '--window-end');
  const windowStartRaw =
    getFlag('--window-start') ?? new Date(windowEnd.ms - SEVEN_DAYS_MS).toISOString();
  const windowStart = parseIsoUtc(windowStartRaw, '--window-start');

  if (windowStart.ms > windowEnd.ms) {
    throw new Error('--window-start must be less than or equal to --window-end');
  }

  return {
    sqlitePath,
    d1JsonPath,
    wranglerD1,
    wranglerConfig,
    windowStartIso: windowStart.iso,
    windowStartMs: windowStart.ms,
    windowEndIso: windowEnd.iso,
    windowEndMs: windowEnd.ms,
    deployedVersion: getFlag('--deployed-version') ?? 'UNKNOWN',
    invitationsIssued: parseNonNegativeInt(getFlag('--invitations-issued'), '--invitations-issued'),
    apiRequestsTotal: parseNonNegativeInt(getFlag('--api-requests-total'), '--api-requests-total'),
    apiErrorsTotal: parseNonNegativeInt(getFlag('--api-errors-total'), '--api-errors-total'),
    userVisibleErrors: parseNonNegativeInt(
      getFlag('--user-visible-errors'),
      '--user-visible-errors',
    ),
  };
}

export function assertReadOnlySelectSql(sql) {
  const trimmed = String(sql ?? '').trim();
  if (!/^SELECT\b/i.test(trimmed)) {
    throw new Error('Only read-only SELECT statements are permitted');
  }
  if (trimmed.includes(';')) {
    throw new Error('Multi-statement SQL is forbidden in read-only telemetry');
  }
  if (FORBIDDEN_SQL_PATTERN.test(trimmed)) {
    throw new Error('Mutating or schema-altering SQL keyword detected');
  }
  return trimmed;
}

function buildRateMetric(numerator, denominator) {
  if (numerator === 'UNKNOWN' || denominator === 'UNKNOWN') {
    return { numerator, denominator, rate: 'UNKNOWN' };
  }
  if (denominator === 0) {
    return { numerator, denominator, rate: 'UNKNOWN' };
  }
  return {
    numerator,
    denominator,
    rate: Number((numerator / denominator).toFixed(4)),
  };
}

export function buildOpcUnitEconomics(activeTesterCount) {
  const testers = typeof activeTesterCount === 'number' && activeTesterCount > 0 ? activeTesterCount : 0;
  const incrementalPerTester7dUsd = 0.02;
  const marginalPerAdditionalUserMonthlyUsd = 0.08;
  return {
    currency: 'USD',
    virtualBalanceNotRevenue: true,
    separateFromMakerAlpha: true,
    windowDays: 7,
    cloudflarePublishedRatesAssumed: {
      workersPaidBaseMonthlyUsd: 5.0,
      workersRequestsPerMillionUsd: 0.3,
      d1RowsReadPerMillionUsd: 0.001,
      d1RowsWrittenPerMillionUsd: 1.0,
      durableObjectsRequestsPerMillionUsd: 0.15,
      kvReadsPerMillionUsd: 0.5,
    },
    estimatedIncrementalCostPerTester7DaysUsd: incrementalPerTester7dUsd,
    estimatedMarginalCostPerAdditionalUserMonthlyUsd: marginalPerAdditionalUserMonthlyUsd,
    estimatedPilotIncrementalTotalUsd: Number((testers * incrementalPerTester7dUsd).toFixed(4)),
  };
}

function tableExists(db, tableName) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row && row.name === tableName);
}

function normalizeOptions(options = {}) {
  const nowMs = Date.now();
  const windowEndIso = options.windowEndIso ?? options.windowEnd ?? new Date(nowMs).toISOString();
  const windowEnd = parseIsoUtc(windowEndIso, 'windowEnd');
  const windowStartIso =
    options.windowStartIso ??
    options.windowStart ??
    new Date(windowEnd.ms - SEVEN_DAYS_MS).toISOString();
  const windowStart = parseIsoUtc(windowStartIso, 'windowStart');

  if (windowStart.ms > windowEnd.ms) {
    throw new Error('windowStart must be less than or equal to windowEnd');
  }

  return {
    windowStartIso: windowStart.iso,
    windowStartMs: windowStart.ms,
    windowEndIso: windowEnd.iso,
    windowEndMs: windowEnd.ms,
    deployedVersion: options.deployedVersion ?? 'UNKNOWN',
    invitationsIssued: options.invitationsIssued ?? 'UNKNOWN',
    apiRequestsTotal: options.apiRequestsTotal ?? 'UNKNOWN',
    apiErrorsTotal: options.apiErrorsTotal ?? 'UNKNOWN',
    userVisibleErrors: options.userVisibleErrors ?? 'UNKNOWN',
  };
}

export function computePilotMetricsFromSqlite(sqlitePath, options = {}) {
  const opts = normalizeOptions(options);
  const db = new DatabaseSync(sqlitePath, { readOnly: true });

  try {
    const startMs = opts.windowStartMs;
    const endMs = opts.windowEndMs;

    const hasUsers = tableExists(db, 'beta_users');
    const hasSessions = tableExists(db, 'beta_sessions');
    const hasOrders = tableExists(db, 'beta_orders');
    const hasLogs = tableExists(db, 'beta_execution_logs');
    const hasPortfolios = tableExists(db, 'beta_portfolios');
    const hasInvites = tableExists(db, 'beta_invite_redemptions');
    const hasFeedback = tableExists(db, 'beta_feedback');

    const successfulInviteRedemptions = hasInvites
      ? Number(
          db
            .prepare(
              'SELECT COUNT(*) AS cnt FROM beta_invite_redemptions WHERE redeemed_at_ms >= ? AND redeemed_at_ms <= ?',
            )
            .get(startMs, endMs)?.cnt ?? 0,
        )
      : 'UNKNOWN';

    const signupCount = hasUsers
      ? Number(
          db
            .prepare(
              'SELECT COUNT(*) AS cnt FROM beta_users WHERE created_at_ms >= ? AND created_at_ms <= ?',
            )
            .get(startMs, endMs)?.cnt ?? 0,
        )
      : 'UNKNOWN';

    const firstLoginCount = hasSessions
      ? Number(
          db
            .prepare(
              'SELECT COUNT(DISTINCT tenant_id) AS cnt FROM beta_sessions WHERE created_at_ms >= ? AND created_at_ms <= ?',
            )
            .get(startMs, endMs)?.cnt ?? 0,
        )
      : 'UNKNOWN';

    const firstStrategyActivationCount = hasLogs
      ? Number(
          db
            .prepare(
              "SELECT COUNT(DISTINCT tenant_id) AS cnt FROM beta_execution_logs WHERE event_code = 'STRATEGY_START' AND created_at_ms >= ? AND created_at_ms <= ?",
            )
            .get(startMs, endMs)?.cnt ?? 0,
        )
      : 'UNKNOWN';

    let simulatedOrderAttempts = 'UNKNOWN';
    let acceptedPaperOrders = 'UNKNOWN';
    let rejectedPaperOrders = 'UNKNOWN';
    if (hasOrders) {
      const orderRow = db
        .prepare(
          `SELECT
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status IN ('FILLED','PENDING') THEN 1 ELSE 0 END), 0) AS accepted,
            COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END), 0) AS rejected
          FROM beta_orders
          WHERE created_at_ms >= ? AND created_at_ms <= ?`,
        )
        .get(startMs, endMs);
      simulatedOrderAttempts = Number(orderRow?.total ?? 0);
      acceptedPaperOrders = Number(orderRow?.accepted ?? 0);
      rejectedPaperOrders = Number(orderRow?.rejected ?? 0);
    }

    const riskGateRejections = hasLogs
      ? Number(
          db
            .prepare(
              "SELECT COUNT(*) AS cnt FROM beta_execution_logs WHERE level = 'RISK_BLOCK' AND created_at_ms >= ? AND created_at_ms <= ?",
            )
            .get(startMs, endMs)?.cnt ?? 0,
        )
      : 'UNKNOWN';

    const haltedEvents = hasLogs
      ? Number(
          db
            .prepare(
              "SELECT COUNT(*) AS cnt FROM beta_execution_logs WHERE level = 'HALT' AND created_at_ms >= ? AND created_at_ms <= ?",
            )
            .get(startMs, endMs)?.cnt ?? 0,
        )
      : 'UNKNOWN';

    let feedbackSubmissions = 'UNKNOWN';
    if (hasFeedback) {
      const rows = db
        .prepare(
          'SELECT category, COUNT(*) AS cnt FROM beta_feedback WHERE created_at_ms >= ? AND created_at_ms <= ? GROUP BY category ORDER BY category ASC',
        )
        .all(startMs, endMs);
      const byCategory = {};
      let total = 0;
      for (const row of rows) {
        const cat = String(row.category);
        const cnt = Number(row.cnt ?? 0);
        byCategory[cat] = cnt;
        total += cnt;
      }
      feedbackSubmissions = { total, byCategory };
    }

    let dailyActiveSessions = [];
    if (hasSessions || hasLogs) {
      const unions = [];
      const params = [];
      if (hasSessions) {
        unions.push(
          "SELECT strftime('%Y-%m-%d', created_at_ms / 1000, 'unixepoch') AS utc_date, tenant_id FROM beta_sessions WHERE created_at_ms >= ? AND created_at_ms <= ?",
        );
        params.push(startMs, endMs);
      }
      if (hasLogs) {
        unions.push(
          "SELECT strftime('%Y-%m-%d', created_at_ms / 1000, 'unixepoch') AS utc_date, tenant_id FROM beta_execution_logs WHERE created_at_ms >= ? AND created_at_ms <= ?",
        );
        params.push(startMs, endMs);
      }
      const sql = `SELECT utc_date, COUNT(DISTINCT tenant_id) AS active_tenants FROM (${unions.join(' UNION ')}) GROUP BY utc_date ORDER BY utc_date ASC`;
      const rows = db.prepare(sql).all(...params);
      dailyActiveSessions = rows.map((r) => ({
        utcDate: String(r.utc_date),
        activeTenantCount: Number(r.active_tenants ?? 0),
      }));
    }

    let simulatedPortfolioSummary = {
      label: 'SIMULATED_PAPER_ONLY_NOT_REAL_PNL',
      portfolioCount: 'UNKNOWN',
      realizedPnlMicro: 'UNKNOWN',
      settledPnlMicro: 'UNKNOWN',
      feesPaidMicro: 'UNKNOWN',
      maxDrawdownBps: 'UNKNOWN',
    };
    if (hasPortfolios) {
      const pRow = db
        .prepare(
          `SELECT
            COUNT(*) AS portfolio_count,
            COALESCE(SUM(realized_pnl_micro), 0) AS realized,
            COALESCE(SUM(settled_pnl_micro), 0) AS settled,
            COALESCE(SUM(fees_paid_micro), 0) AS fees,
            COALESCE(MAX(max_drawdown_bps), 0) AS max_dd_bps
          FROM beta_portfolios`,
        )
        .get();
      simulatedPortfolioSummary = {
        label: 'SIMULATED_PAPER_ONLY_NOT_REAL_PNL',
        portfolioCount: Number(pRow?.portfolio_count ?? 0),
        realizedPnlMicro: Number(pRow?.realized ?? 0),
        settledPnlMicro: Number(pRow?.settled ?? 0),
        feesPaidMicro: Number(pRow?.fees ?? 0),
        maxDrawdownBps: Number(pRow?.max_dd_bps ?? 0),
      };
    }

    const activeTesters = typeof signupCount === 'number' ? signupCount : 0;

    return {
      schemaVersion: 'poly-beta-pilot-metrics/v1',
      readOnly: true,
      source: 'sqlite',
      deployedVersion: opts.deployedVersion,
      window: {
        startUtc: opts.windowStartIso,
        endUtc: opts.windowEndIso,
      },
      metrics: {
        invitationsIssued: opts.invitationsIssued,
        successfulInviteRedemptions,
        signupCompletion: buildRateMetric(signupCount, opts.invitationsIssued),
        firstSuccessfulLogin: buildRateMetric(firstLoginCount, signupCount),
        firstSuccessfulPaperStrategyActivation: buildRateMetric(
          firstStrategyActivationCount,
          signupCount,
        ),
        simulatedOrderAttempts,
        acceptedPaperOrders,
        rejectedPaperOrders,
        riskGateRejections,
        haltedEvents,
        apiErrorRate: buildRateMetric(opts.apiErrorsTotal, opts.apiRequestsTotal),
        userVisibleErrors: opts.userVisibleErrors,
        feedbackSubmissions,
        dailyActiveSessions,
        simulatedPortfolioSummary,
      },
      opcUnitEconomics: buildOpcUnitEconomics(activeTesters),
    };
  } finally {
    db.close();
  }
}

export function computePilotMetricsFromD1Json(jsonPath, options = {}) {
  const opts = normalizeOptions(options);
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const agg = raw.aggregates ?? raw;

  const signupCount = typeof agg.signups === 'number' ? agg.signups : 'UNKNOWN';
  const firstLoginCount =
    typeof agg.firstSuccessfulLoginCount === 'number' ? agg.firstSuccessfulLoginCount : 'UNKNOWN';
  const firstStrategyCount =
    typeof agg.firstSuccessfulPaperStrategyActivationCount === 'number'
      ? agg.firstSuccessfulPaperStrategyActivationCount
      : 'UNKNOWN';

  const feedbackRaw = agg.feedbackSubmissions;
  let feedbackSubmissions = 'UNKNOWN';
  if (feedbackRaw && typeof feedbackRaw === 'object' && typeof feedbackRaw.total === 'number') {
    const safeByCategory = {};
    if (feedbackRaw.byCategory && typeof feedbackRaw.byCategory === 'object') {
      for (const [k, v] of Object.entries(feedbackRaw.byCategory)) {
        if (typeof v === 'number') safeByCategory[String(k)] = v;
      }
    }
    feedbackSubmissions = { total: feedbackRaw.total, byCategory: safeByCategory };
  }

  const dailyActiveSessions = Array.isArray(agg.dailyActiveSessions)
    ? agg.dailyActiveSessions.map((d) => ({
        utcDate: String(d.utcDate),
        activeTenantCount: Number(d.activeTenantCount ?? 0),
      }))
    : [];

  const simRaw = agg.simulatedPortfolioSummary ?? {};
  const simulatedPortfolioSummary = {
    label: 'SIMULATED_PAPER_ONLY_NOT_REAL_PNL',
    portfolioCount: typeof simRaw.portfolioCount === 'number' ? simRaw.portfolioCount : 'UNKNOWN',
    realizedPnlMicro:
      typeof simRaw.realizedPnlMicro === 'number' ? simRaw.realizedPnlMicro : 'UNKNOWN',
    settledPnlMicro: typeof simRaw.settledPnlMicro === 'number' ? simRaw.settledPnlMicro : 'UNKNOWN',
    feesPaidMicro: typeof simRaw.feesPaidMicro === 'number' ? simRaw.feesPaidMicro : 'UNKNOWN',
    maxDrawdownBps: typeof simRaw.maxDrawdownBps === 'number' ? simRaw.maxDrawdownBps : 'UNKNOWN',
  };

  const activeTesters = typeof signupCount === 'number' ? signupCount : 0;

  return {
    schemaVersion: 'poly-beta-pilot-metrics/v1',
    readOnly: true,
    source: 'd1-json',
    deployedVersion: opts.deployedVersion,
    window: {
      startUtc: opts.windowStartIso,
      endUtc: opts.windowEndIso,
    },
    metrics: {
      invitationsIssued: opts.invitationsIssued,
      successfulInviteRedemptions:
        typeof agg.successfulInviteRedemptions === 'number'
          ? agg.successfulInviteRedemptions
          : 'UNKNOWN',
      signupCompletion: buildRateMetric(signupCount, opts.invitationsIssued),
      firstSuccessfulLogin: buildRateMetric(firstLoginCount, signupCount),
      firstSuccessfulPaperStrategyActivation: buildRateMetric(firstStrategyCount, signupCount),
      simulatedOrderAttempts:
        typeof agg.simulatedOrderAttempts === 'number' ? agg.simulatedOrderAttempts : 'UNKNOWN',
      acceptedPaperOrders:
        typeof agg.acceptedPaperOrders === 'number' ? agg.acceptedPaperOrders : 'UNKNOWN',
      rejectedPaperOrders:
        typeof agg.rejectedPaperOrders === 'number' ? agg.rejectedPaperOrders : 'UNKNOWN',
      riskGateRejections:
        typeof agg.riskGateRejections === 'number' ? agg.riskGateRejections : 'UNKNOWN',
      haltedEvents: typeof agg.haltedEvents === 'number' ? agg.haltedEvents : 'UNKNOWN',
      apiErrorRate: buildRateMetric(opts.apiErrorsTotal, opts.apiRequestsTotal),
      userVisibleErrors: opts.userVisibleErrors,
      feedbackSubmissions,
      dailyActiveSessions,
      simulatedPortfolioSummary,
    },
    opcUnitEconomics: buildOpcUnitEconomics(activeTesters),
  };
}

export function computePilotMetricsFromWranglerD1(dbName, options = {}, execFn) {
  const opts = normalizeOptions(options);
  const configPath = options.wranglerConfig ?? 'wrangler.poly-beta.toml';
  const startMs = opts.windowStartMs;
  const endMs = opts.windowEndMs;

  const runSelect = (sql) => {
    const safeSql = assertReadOnlySelectSql(sql);
    const runner =
      execFn ??
      ((args) =>
        execFileSync('npx', args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }));
    const stdout = runner([
      'wrangler',
      'd1',
      'execute',
      dbName,
      '--config',
      configPath,
      '--json',
      '--command',
      safeSql,
    ]);
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) && parsed[0]?.results ? parsed[0].results : [];
  };

  const countOrUnknown = (sql) => {
    try {
      const rows = runSelect(sql);
      return Number(rows[0]?.cnt ?? 0);
    } catch {
      return 'UNKNOWN';
    }
  };

  const successfulInviteRedemptions = countOrUnknown(
    `SELECT COUNT(*) AS cnt FROM beta_invite_redemptions WHERE redeemed_at_ms >= ${startMs} AND redeemed_at_ms <= ${endMs}`,
  );
  const signupCount = countOrUnknown(
    `SELECT COUNT(*) AS cnt FROM beta_users WHERE created_at_ms >= ${startMs} AND created_at_ms <= ${endMs}`,
  );
  const firstLoginCount = countOrUnknown(
    `SELECT COUNT(DISTINCT tenant_id) AS cnt FROM beta_sessions WHERE created_at_ms >= ${startMs} AND created_at_ms <= ${endMs}`,
  );
  const firstStrategyCount = countOrUnknown(
    `SELECT COUNT(DISTINCT tenant_id) AS cnt FROM beta_execution_logs WHERE event_code = 'STRATEGY_START' AND created_at_ms >= ${startMs} AND created_at_ms <= ${endMs}`,
  );

  let simulatedOrderAttempts = 'UNKNOWN';
  let acceptedPaperOrders = 'UNKNOWN';
  let rejectedPaperOrders = 'UNKNOWN';
  try {
    const orderRows = runSelect(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status IN ('FILLED','PENDING') THEN 1 ELSE 0 END), 0) AS accepted, COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END), 0) AS rejected FROM beta_orders WHERE created_at_ms >= ${startMs} AND created_at_ms <= ${endMs}`,
    );
    simulatedOrderAttempts = Number(orderRows[0]?.total ?? 0);
    acceptedPaperOrders = Number(orderRows[0]?.accepted ?? 0);
    rejectedPaperOrders = Number(orderRows[0]?.rejected ?? 0);
  } catch {
    simulatedOrderAttempts = 'UNKNOWN';
    acceptedPaperOrders = 'UNKNOWN';
    rejectedPaperOrders = 'UNKNOWN';
  }
  const riskGateRejections = countOrUnknown(
    `SELECT COUNT(*) AS cnt FROM beta_execution_logs WHERE level = 'RISK_BLOCK' AND created_at_ms >= ${startMs} AND created_at_ms <= ${endMs}`,
  );
  const haltedEvents = countOrUnknown(
    `SELECT COUNT(*) AS cnt FROM beta_execution_logs WHERE level = 'HALT' AND created_at_ms >= ${startMs} AND created_at_ms <= ${endMs}`,
  );

  let feedbackSubmissions = 'UNKNOWN';
  try {
    const fbRows = runSelect(
      `SELECT category, COUNT(*) AS cnt FROM beta_feedback WHERE created_at_ms >= ${startMs} AND created_at_ms <= ${endMs} GROUP BY category ORDER BY category ASC`,
    );
    const byCategory = {};
    let total = 0;
    for (const r of fbRows) {
      byCategory[String(r.category)] = Number(r.cnt ?? 0);
      total += Number(r.cnt ?? 0);
    }
    feedbackSubmissions = { total, byCategory };
  } catch {
    feedbackSubmissions = 'UNKNOWN';
  }

  const activeTesters = typeof signupCount === 'number' ? signupCount : 0;

  return {
    schemaVersion: 'poly-beta-pilot-metrics/v1',
    readOnly: true,
    source: 'wrangler-d1',
    deployedVersion: opts.deployedVersion,
    window: {
      startUtc: opts.windowStartIso,
      endUtc: opts.windowEndIso,
    },
    metrics: {
      invitationsIssued: opts.invitationsIssued,
      successfulInviteRedemptions,
      signupCompletion: buildRateMetric(signupCount, opts.invitationsIssued),
      firstSuccessfulLogin: buildRateMetric(firstLoginCount, signupCount),
      firstSuccessfulPaperStrategyActivation: buildRateMetric(firstStrategyCount, signupCount),
      simulatedOrderAttempts,
      acceptedPaperOrders,
      rejectedPaperOrders,
      riskGateRejections,
      haltedEvents,
      apiErrorRate: buildRateMetric(opts.apiErrorsTotal, opts.apiRequestsTotal),
      userVisibleErrors: opts.userVisibleErrors,
      feedbackSubmissions,
      dailyActiveSessions: [],
      simulatedPortfolioSummary: {
        label: 'SIMULATED_PAPER_ONLY_NOT_REAL_PNL',
        portfolioCount: 'UNKNOWN',
        realizedPnlMicro: 'UNKNOWN',
        settledPnlMicro: 'UNKNOWN',
        feesPaidMicro: 'UNKNOWN',
        maxDrawdownBps: 'UNKNOWN',
      },
    },
    opcUnitEconomics: buildOpcUnitEconomics(activeTesters),
  };
}

function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  let result;
  if (parsed.sqlitePath) {
    result = computePilotMetricsFromSqlite(parsed.sqlitePath, parsed);
  } else if (parsed.d1JsonPath) {
    result = computePilotMetricsFromD1Json(parsed.d1JsonPath, parsed);
  } else if (parsed.wranglerD1) {
    result = computePilotMetricsFromWranglerD1(parsed.wranglerD1, parsed);
  } else {
    throw new Error('Provide one of --sqlite <path>, --d1-json <path>, or --wrangler-d1 <db-name>');
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
