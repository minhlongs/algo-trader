/**
 * Verdict Summary
 *
 * Pure aggregation of research ledger records by strategyRef. Zero fs — the
 * companion `loadVerdictSummary` is the thin fs wrapper.
 *
 * The summary answers: "For each strategy, how many runs, how many passed,
 * what is the pass rate, and what was the most recent result?"
 */

import type { LedgerRecord } from './research-ledger';
import { readLedgerRecords, DEFAULT_LEDGER_PATH } from './research-ledger';
import type { ResultClassName } from './run-card';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StrategyVerdictSummary {
  strategyRef: string;
  totalRuns: number;
  passedCount: number;
  passRate: number;
  lastVerdictPassed: boolean | null;
  lastResultClass: ResultClassName | null;
  lastRecordedAt: string | null;
}

export interface VerdictSummary {
  byStrategy: Record<string, StrategyVerdictSummary>;
  totalRecords: number;
}

// ── Pure Aggregation ─────────────────────────────────────────────────────────

/**
 * Summarize ledger records by strategyRef. Pure — no fs, no side effects.
 *
 * `passRate` is 0 when `totalRuns === 0` (never divide by zero).
 * Records are sorted by `recordedAt` so the "last" record is deterministic.
 */
export function summarizeVerdicts(records: LedgerRecord[]): VerdictSummary {
  const byStrategy: Record<string, StrategyVerdictSummary> = {};

  for (const record of records) {
    const ref = record.strategyRef;
    if (!byStrategy[ref]) {
      byStrategy[ref] = {
        strategyRef: ref,
        totalRuns: 0,
        passedCount: 0,
        passRate: 0,
        lastVerdictPassed: null,
        lastResultClass: null,
        lastRecordedAt: null,
      };
    }

    const summary = byStrategy[ref]!;
    summary.totalRuns += 1;
    const allGatesPassed = Object.values(record.gates).every(Boolean);
    if (allGatesPassed) {
      summary.passedCount += 1;
    }
  }

  // Compute pass rates and find the most recent record per strategy.
  for (const summary of Object.values(byStrategy)) {
    summary.passRate =
      summary.totalRuns > 0 ? summary.passedCount / summary.totalRuns : 0;

    const sortedRecords = records
      .filter((r) => r.strategyRef === summary.strategyRef)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));

    const last = sortedRecords[sortedRecords.length - 1];
    if (last) {
      summary.lastVerdictPassed = Object.values(last.gates).every(Boolean);
      summary.lastResultClass = last.resultClass;
      summary.lastRecordedAt = last.recordedAt;
    }
  }

  return { byStrategy, totalRecords: records.length };
}

// ── Fs Wrapper ───────────────────────────────────────────────────────────────

/**
 * Load ledger records and summarize them. Fail-safe: returns empty summary
 * when the ledger file doesn't exist or is unreadable.
 */
export async function loadVerdictSummary(
  ledgerPath: string = DEFAULT_LEDGER_PATH,
): Promise<VerdictSummary> {
  const records = await readLedgerRecords(ledgerPath);
  return summarizeVerdicts(records);
}
