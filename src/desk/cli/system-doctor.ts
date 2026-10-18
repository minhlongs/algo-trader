/**
 * System Doctor — check engine for `cashclaw doctor`.
 *
 * Five environment health checks, each reported PASS / FAIL / UNREACHABLE:
 *   1. execution-mode        — must be READ_ONLY (LIVE/PAPER fails loudly)
 *   2. ohlcv-store           — Postgres reachable + ohlcv_candles row count
 *   3. provenance-ledger     — ledger file readable + record count
 *   4. promotion-gates       — evaluateGates summary (honest "no paper data yet")
 *   5. quality-baseline      — quality-baseline.json parses + version echoed
 *
 * Exit-code policy: 0 only when NO check reports FAIL. UNREACHABLE is
 * tolerated so the doctor stays useful offline (e.g. Postgres down locally).
 * Graceful-degradation pattern follows `src/alpha-lab/check-gates.ts`.
 *
 * All dependencies are injected via `DoctorDeps`; unit tests substitute fakes
 * without touching Postgres, the network, or the filesystem. Real dependency
 * wiring lives in `system-doctor-defaults.ts`.
 */

import {
  errorMessage,
  fail,
  formatExecutionModeCheck,
  formatGatesCheck,
  formatLedgerCheck,
  pass,
  renderDoctorReport,
} from './system-doctor-helpers';

export {
  errorMessage,
  fail,
  formatExecutionModeCheck,
  formatGatesCheck,
  formatLedgerCheck,
  pass,
  renderDoctorReport,
} from './system-doctor-helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckStatus = 'PASS' | 'FAIL' | 'UNREACHABLE';

export interface CheckResult {
  /** Stable machine identifier, e.g. `execution-mode`. */
  id: string;
  /** Human-readable label printed next to the status. */
  label: string;
  status: CheckStatus;
  /** Truthful detail line explaining the verdict. */
  detail: string;
}

export interface DoctorReport {
  checks: CheckResult[];
  /** True only when no check has status FAIL (UNREACHABLE tolerated). */
  ok: boolean;
}

/** Provenance-ledger inspection outcome. */
export interface LedgerInspection {
  state: 'ok' | 'missing' | 'corrupt';
  count: number;
}

/** Reduced gate-evaluation summary surfaced by check 4. */
export interface GateSummary {
  totalGates: number;
  passedCount: number;
  /** False when the underlying trade list was empty ("no paper data yet"). */
  hasPaperData: boolean;
}

export interface DoctorDeps {
  getExecutionMode: () => 'READ_ONLY' | 'PAPER' | 'LIVE';
  /** Resolves the ohlcv_candles row count; rejects when Postgres unreachable. */
  countOhlcvCandles: () => Promise<number>;
  inspectLedger: () => Promise<LedgerInspection>;
  /** Resolves the gate-evaluation summary; rejects when evaluation fails. */
  loadGateSummary: () => Promise<GateSummary>;
  /** Resolves quality-baseline.json version; rejects when unreadable. */
  readQualityBaselineVersion: () => Promise<string>;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export async function runSystemDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const checks: CheckResult[] = [];

  // 1. Execution mode — READ_ONLY is the safe default; LIVE/PAPER is loud FAIL.
  checks.push(formatExecutionModeCheck(deps.getExecutionMode()));

  // 2. Postgres OHLCV store — UNREACHABLE tolerated offline.
  try {
    const candles = await deps.countOhlcvCandles();
    checks.push(
      pass('ohlcv-store', 'Postgres ohlcv_candles', `reachable — SELECT COUNT(*) returned ${candles} candle(s)`),
    );
  } catch (err) {
    checks.push({
      id: 'ohlcv-store',
      label: 'Postgres ohlcv_candles',
      status: 'UNREACHABLE',
      detail: `database not reachable (tolerated offline): ${errorMessage(err)}`,
    });
  }

  // 3. Provenance ledger — missing file is a valid fresh-install state.
  try {
    checks.push(formatLedgerCheck(await deps.inspectLedger()));
  } catch (err) {
    checks.push(fail('provenance-ledger', 'Provenance ledger', `inspection failed: ${errorMessage(err)}`));
  }

  // 4. Promotion gates — informational summary; honest about empty data.
  try {
    checks.push(formatGatesCheck(await deps.loadGateSummary()));
  } catch (err) {
    checks.push(fail('promotion-gates', 'Promotion gates', `gate evaluation failed: ${errorMessage(err)}`));
  }

  // 5. Quality baseline — the ratchet floor must stay machine-readable.
  try {
    const version = await deps.readQualityBaselineVersion();
    checks.push(pass('quality-baseline', 'Quality baseline', `parsed OK — version ${version}`));
  } catch (err) {
    checks.push(fail('quality-baseline', 'Quality baseline', `unreadable or invalid JSON: ${errorMessage(err)}`));
  }

  const failed = checks.some((c) => c.status === 'FAIL');
  return { checks, ok: !failed };
}
