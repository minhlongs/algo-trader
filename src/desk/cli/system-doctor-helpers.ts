/**
 * Pure diagnostic check builders and report formatting helpers for System Doctor.
 */

import { logger } from '../../shared/utils/logger';
import type {
  CheckResult,
  DoctorReport,
  GateSummary,
  LedgerInspection,
} from './system-doctor';

export function fail(id: string, label: string, detail: string): CheckResult {
  return { id, label, status: 'FAIL', detail };
}

export function pass(id: string, label: string, detail: string): CheckResult {
  return { id, label, status: 'PASS', detail };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatExecutionModeCheck(mode: 'READ_ONLY' | 'PAPER' | 'LIVE'): CheckResult {
  return mode === 'READ_ONLY'
    ? pass('execution-mode', 'Execution mode', 'READ_ONLY (safe default — no orders can flow)')
    : fail(
        'execution-mode',
        'Execution mode',
        `expected READ_ONLY, got ${mode} — DO NOT proceed with trading ops`,
      );
}

export function formatLedgerCheck(ledger: LedgerInspection): CheckResult {
  if (ledger.state === 'corrupt') {
    return fail('provenance-ledger', 'Provenance ledger', 'ledger exists but contains malformed record(s)');
  }
  const note = ledger.state === 'missing' ? 'no ledger file yet (fresh install state)' : 'readable';
  return pass('provenance-ledger', 'Provenance ledger', `${note} — ${ledger.count} record(s)`);
}

export function formatGatesCheck(gates: GateSummary): CheckResult {
  const dataNote = gates.hasPaperData
    ? 'paper data present'
    : 'no paper data yet — summary reflects empty trade history';
  return pass(
    'promotion-gates',
    'Promotion gates',
    `evaluated ${gates.totalGates} gate(s), ${gates.passedCount} passing (${dataNote})`,
  );
}

/** Print the report via the shared logger (no raw console calls). */
export function renderDoctorReport(report: DoctorReport): void {
  logger.info('CashClaw System Doctor');
  logger.info('─'.repeat(60));
  for (const check of report.checks) {
    logger.info(`[${check.status}] ${check.label}: ${check.detail}`);
  }
  logger.info('─'.repeat(60));
  const failed = report.checks.filter((c) => c.status === 'FAIL').length;
  const unreachable = report.checks.filter((c) => c.status === 'UNREACHABLE').length;
  const summary = failed > 0 ? `${failed} check(s) FAILED` : 'all checks passed';
  const suffix = unreachable > 0 ? `, ${unreachable} unreachable (tolerated)` : '';
  logger.info(`Result: ${summary}${suffix} — exit ${report.ok ? 0 : 1}`);
}
