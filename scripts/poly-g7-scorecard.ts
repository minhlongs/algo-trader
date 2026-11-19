/**
 * Polymarket G7.2b / G7.5 Machine-Readable IC KPI Scorecard CLI
 *
 * Usage:
 *   npx tsx scripts/poly-g7-scorecard.ts
 *   npx tsx scripts/poly-g7-scorecard.ts --input path/to/scorecard-input.json
 *   npx tsx scripts/poly-g7-scorecard.ts --l2-dir data/polymarket/l2-wal --market-blind-ledger data/polymarket/market-blind.jsonl
 *
 * Without `--input`, inspects workspace empirical sample directories (defaulting
 * fail-closed to 0 recorded L2 WAL days, 0 qualifying maker fills, and 0 resolved
 * OOS forecasts) and prints the machine-readable JSON scorecard to stdout.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadICEvidenceForScorecard } from '../src/desk/polymarket/ic-evidence-loader';
import {
  evaluateICKpiScorecard,
  type ICEmpiricalSamples,
  type ICScorecardInput,
} from '../src/desk/polymarket/ic-kpi-scorecard';

function parseFlagValue(argv: readonly string[], flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  const candidate = argv[idx + 1];
  if (!candidate || candidate.startsWith('--')) {
    throw new Error(`Missing value after ${flag}`);
  }
  return resolve(process.cwd(), candidate);
}

function loadInputFromJson(filePath: string): ICScorecardInput {
  const raw = readFileSync(filePath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object in ${filePath}`);
  }
  const obj = parsed as Partial<ICScorecardInput>;
  const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  const samples: ICEmpiricalSamples = {
    recordedL2Days: nonNeg(obj.samples?.recordedL2Days),
    qualifyingMakerFills: nonNeg(obj.samples?.qualifyingMakerFills),
    resolvedOosForecasts: nonNeg(obj.samples?.resolvedOosForecasts),
  };
  return {
    ...obj,
    mode: obj.mode === 'pilot' ? 'pilot' : 'sim',
    strategyClass: obj.strategyClass === 'event' ? 'event' : 'mm',
    samples,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputPath = parseFlagValue(argv, '--input');
  const l2Dir = parseFlagValue(argv, '--l2-dir') ?? resolve(process.cwd(), 'data/polymarket/l2-wal');
  const mbLedger =
    parseFlagValue(argv, '--market-blind-ledger') ?? resolve(process.cwd(), 'data/polymarket/market-blind.jsonl');

  const scorecardInput: ICScorecardInput = inputPath
    ? loadInputFromJson(inputPath)
    : loadICEvidenceForScorecard({
        l2ArchiveDir: l2Dir,
        marketBlindLedgerPath: mbLedger,
      }).scorecardInput;
  const report = evaluateICKpiScorecard(scorecardInput);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[poly-g7-scorecard] ERROR: ${msg}\n`);
  process.exitCode = 1;
}
