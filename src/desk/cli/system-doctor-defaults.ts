/**
 * System Doctor — real dependency wiring + CLI rendering for `cashclaw doctor`.
 *
 * The check engine (`system-doctor.ts`) is pure and injectable; this file binds
 * it to the real environment:
 *   - execution mode from `src/desk/execution/execution-mode.ts`
 *   - ohlcv_candles count via the Postgres pool (`src/db/postgres-client.ts`)
 *   - provenance ledger via `src/alpha-lab/provenance/research-ledger.ts`
 *   - gate summary via `src/alpha-lab/gates/gate-evaluator.ts` (paper-trades API
 *     fetched with the same graceful-degradation pattern as `check-gates.ts`)
 *   - quality-baseline.json at repo root
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDbClient } from '../../db/postgres-client';
import { DEFAULT_LEDGER_PATH, readLedgerRecords } from '../../alpha-lab/provenance/research-ledger';
import { evaluateGates } from '../../alpha-lab/gates/gate-evaluator';
import type { GateEvaluatorInput } from '../../alpha-lab/gates/gate-evaluator';
import { getExecutionMode } from '../../desk/execution/execution-mode';
import { runSystemDoctor, renderDoctorReport } from './system-doctor';
import type { DoctorDeps, GateSummary, LedgerInspection } from './system-doctor';

// ── CLI entry point ───────────────────────────────────────────────────────────

/** CLI entry wired to `cashclaw doctor`; exit 1 when any check FAILs. */
export async function runDoctorCli(): Promise<void> {
  const report = await runSystemDoctor(defaultDoctorDeps());
  renderDoctorReport(report);
  if (!report.ok) process.exit(1);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REPO_ROOT = process.cwd();
const QUALITY_BASELINE_PATH = join(REPO_ROOT, 'quality-baseline.json');
const PAPER_INITIAL_CAPITAL_USD = 10_000;
const GATE_EVAL_TIMEOUT_MS = 15_000;

interface PaperTradeRow {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  pnl: number | null;
  timestamp: string;
}

// ── Real dependency implementations ───────────────────────────────────────────

async function countOhlcvCandles(): Promise<number> {
  const result = await getDbClient().query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM ohlcv_candles');
  return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

/**
 * Inspect the ledger with a corrupt-record signal — `readLedgerRecords`
 * swallows parse failures and returns [], so we re-read the raw lines to
 * distinguish "missing" (fresh install) from "corrupt".
 */
export async function inspectLedger(ledgerPath: string = DEFAULT_LEDGER_PATH): Promise<LedgerInspection> {
  const records = await readLedgerRecords(ledgerPath);
  if (records.length > 0) return { state: 'ok', count: records.length };

  let raw = '';
  try {
    raw = await readFile(ledgerPath, 'utf8');
  } catch {
    return { state: 'missing', count: 0 };
  }
  const nonEmptyLines = raw.split('\n').filter((line) => line.trim().length > 0);
  // File has content but zero parsed records => malformed entries.
  return nonEmptyLines.length > 0 ? { state: 'corrupt', count: 0 } : { state: 'missing', count: 0 };
}

/** Fetch closed paper trades; empty on any failure (offline tolerated). */
async function fetchPaperTrades(): Promise<PaperTradeRow[]> {
  try {
    const res = await fetch('https://api.cashclaw.cc/api/v1/paper-trades', {
      signal: AbortSignal.timeout(GATE_EVAL_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { trades?: PaperTradeRow[] };
    return body.trades ?? [];
  } catch {
    return [];
  }
}

/** Build gate-evaluator input mirroring check-gates.ts equity-curve handling. */
async function loadGateSummary(): Promise<GateSummary> {
  const trades = await fetchPaperTrades();
  const closed = trades.filter((t) => t.pnl !== null);
  const sorted = [...closed].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let equity = PAPER_INITIAL_CAPITAL_USD;
  const equityCurve = sorted.map((t) => {
    equity += t.pnl ?? 0;
    return { timestamp: t.timestamp, equity };
  });
  const startDate =
    sorted.length > 0
      ? sorted[0].timestamp
      : new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

  const input: GateEvaluatorInput = {
    trades: closed.map((t) => ({
      timestamp: t.timestamp,
      tokenId: t.tokenId,
      side: t.side,
      price: t.price,
      size: t.size,
      pnl: t.pnl,
    })),
    startDate,
    equityCurve,
    flags: { kellyWired: true, circuitBreakerTested: true },
  };

  const reading = evaluateGates(input);
  return {
    totalGates: reading.totalGates,
    passedCount: reading.passedCount,
    hasPaperData: closed.length > 0,
  };
}

interface QualityBaselineJson {
  version?: string;
}

async function readQualityBaselineVersion(): Promise<string> {
  const raw = await readFile(QUALITY_BASELINE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as QualityBaselineJson;
  if (!parsed.version) throw new Error('version field missing');
  return parsed.version;
}

/** Real-environment doctor dependencies. */
export function defaultDoctorDeps(): DoctorDeps {
  return {
    getExecutionMode,
    countOhlcvCandles,
    inspectLedger,
    loadGateSummary,
    readQualityBaselineVersion,
  };
}
