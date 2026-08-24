/**
 * Record Alpha Verdict
 *
 * Bridge module wiring evaluateAlpha -> writeAlphaReport -> appendLedgerRecord.
 * Maps an ExperimentResult to a CandidateResult (TEST split only, no
 * train/val leakage) and persists the verdict to both the alpha report
 * store and the research ledger.
 *
 * Fail-safe: never throws — all errors captured in the returned outcome.
 *
 * IMPORT RULE (F5): no logger.info / logger.debug calls — they route to
 * console.info/debug = STDOUT. Use process.stderr.write or rely on pure
 * return values instead.
 */

import { evaluateAlpha } from '../attribution/alpha-evaluator';
import type {
  CandidateResult,
  AlphaVerdict,
  SurvivalCriteria,
} from '../attribution/alpha-evaluator';
import type { ExperimentResult } from '../experiments/experiment-types';
import type { ResultClassName } from './run-card';
import {
  writeAlphaReport,
  DEFAULT_ALPHA_REPORT_ROOT,
} from './alpha-report-store';
import type { AlphaReport } from './alpha-report-store';
import {
  appendLedgerRecord,
  DEFAULT_LEDGER_PATH,
} from './research-ledger';
import type { LedgerWriteResult } from './research-ledger';

// ── Types ───────────────────────────────────────────────────────────────────

export interface RecordAlphaVerdictInput {
  candidateId: string;
  runId?: string;
  configHash: string;
  strategyRef: string;
  resultClass?: ResultClassName;
  candidate: CandidateResult;
  candles: Array<{ timestamp: string; close: number }>;
  criteria?: Partial<SurvivalCriteria>;
}

export interface RecordAlphaVerdictPaths {
  alphaReportRoot?: string;
  ledgerPath?: string;
  reportDir?: string;
}

export interface RecordAlphaVerdictOutcome {
  verdict: AlphaVerdict;
  report: AlphaReport;
  ledger: LedgerWriteResult;
  ok: boolean;
}

// ── CandidateResult mapping ─────────────────────────────────────────────────

/**
 * Map an ExperimentResult to a CandidateResult using TEST split metrics
 * only (honest OOS-leaning mapping). Train/val metrics are never leaked
 * into the verdict.
 */
export function candidateResultFromExperiment(
  result: ExperimentResult,
): CandidateResult {
  const test = result.metrics.test;
  return {
    name: result.config.experimentId,
    totalNetPnl: test.totalPnl,
    winRate: test.winRate,
    sharpeRatio: test.sharpeRatio,
    totalTrades: test.numTrades,
    profitFactor: test.profitFactor,
    maxDrawdown: test.maxDrawdown,
  };
}

// ── Bridge ──────────────────────────────────────────────────────────────────

/**
 * Evaluate a candidate against baselines, write the alpha report, and
 * append a ledger record. Fail-safe: never throws; all errors captured
 * in the returned outcome.
 */
export async function recordAlphaVerdict(
  input: RecordAlphaVerdictInput,
  paths: RecordAlphaVerdictPaths = {},
): Promise<RecordAlphaVerdictOutcome> {
  const alphaReportRoot = paths.alphaReportRoot ?? DEFAULT_ALPHA_REPORT_ROOT;
  const ledgerPath = paths.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const reportDir = paths.reportDir ?? alphaReportRoot;

  const fallback: RecordAlphaVerdictOutcome = {
    verdict: {
      passed: false,
      failedCriteria: ['recordAlphaVerdict: unexpected error before evaluation'],
      comparisons: [],
      recommendation: 'Error during alpha verdict recording',
    },
    report: {
      candidateId: input.candidateId,
      verdict: {
        passed: false,
        failedCriteria: [],
        comparisons: [],
        recommendation: '',
      },
      createdAt: new Date().toISOString(),
    },
    ledger: { ok: false, error: 'recordAlphaVerdict: failed before ledger write' },
    ok: false,
  };

  try {
    const verdict = evaluateAlpha(
      input.candidate,
      input.candles,
      input.criteria ?? {},
    );

    const report = await writeAlphaReport(reportDir, input.candidateId, verdict);

    const ledger = await appendLedgerRecord(
      {
        runId: input.runId ?? input.candidateId,
        configHash: input.configHash,
        resultClass: input.resultClass ?? 'IS',
        strategyRef: input.strategyRef,
        gates: { alphaSurvival: verdict.passed },
      },
      ledgerPath,
    );

    return { verdict, report, ledger, ok: ledger.ok };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[recordAlphaVerdict] fail-safe caught: ${message}\n`,
    );
    fallback.verdict.failedCriteria = [
      `recordAlphaVerdict: ${message}`,
    ];
    fallback.ledger = { ok: false, error: message };
    return fallback;
  }
}
