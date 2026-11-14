/**
 * Terminal table & JSON formatter for the 11 Polymarket Governance KPIs.
 */

import type { KpiEvaluationReport, KpiVerdict } from './kpi-poly-types';

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

export function summarizeOverallVerdict(verdicts: readonly KpiVerdict[]): KpiVerdict {
  if (verdicts.some((v) => v === 'NO-GO')) return 'NO-GO';
  if (verdicts.every((v) => v === 'GO')) return 'GO';
  return 'NOT ENOUGH DATA';
}

export function formatKpiEvaluationReport(report: KpiEvaluationReport): string {
  const { provenance, rows, generatedAtIso } = report;
  const goCount = rows.filter((r) => r.verdict === 'GO').length;
  const nogoCount = rows.filter((r) => r.verdict === 'NO-GO').length;
  const nedCount = rows.filter((r) => r.verdict === 'NOT ENOUGH DATA').length;
  const overall = summarizeOverallVerdict(rows.map((r) => r.verdict));

  const nameW = Math.max(24, ...rows.map((r) => r.name.length));
  const valW = Math.max(27, ...rows.map((r) => r.formattedValue.length));
  const thrW = Math.max(42, ...rows.map((r) => r.threshold.length));
  const verW = Math.max(16, ...rows.map((r) => r.verdict.length));
  const totalW = 3 + nameW + valW + thrW + verW + 12;

  const lines: string[] = [];
  const rule = '='.repeat(totalW);
  const thin = '-'.repeat(totalW);

  lines.push(rule);
  lines.push(`POLYMARKET QUANT ALPHA — 11 GOVERNANCE KPIs (PAPER / OBSERVED DATA ONLY) | ${generatedAtIso}`);
  lines.push(
    `Provenance verified: sources=[${provenance.sourcesSeen.join(', ')}] | ` +
      `snapshots=${provenance.snapshotCount} (ticks=${provenance.marketTickCount}) | ` +
      `prices-history=${provenance.pricesHistoryRows} | ` +
      `data-api-v2=${provenance.dataApiV2Trades} | ` +
      `recorded-l2=${provenance.recordedL2Steps}`,
  );
  lines.push(rule);
  lines.push(
    `${pad('#', 3)} | ${pad('KPI', nameW)} | ${pad('Measured Value', valW)} | ${pad('Threshold', thrW)} | ${pad('Verdict', verW)}`,
  );
  lines.push(thin);

  for (const row of rows) {
    lines.push(
      `${pad(String(row.id), 3)} | ` +
        `${pad(row.name, nameW)} | ` +
        `${pad(row.formattedValue, valW)} | ` +
        `${pad(row.threshold, thrW)} | ` +
        `${pad(row.verdict, verW)}`,
    );
    lines.push(`    └─ ${row.reason}`);
  }

  lines.push(rule);
  lines.push(
    `OVERALL GATE: ${overall}  (GO=${goCount}/11 | NO-GO=${nogoCount}/11 | NOT ENOUGH DATA=${nedCount}/11)`,
  );
  lines.push(rule);
  return `${lines.join('\n')}\n`;
}
