/**
 * Polymarket G7.2b Machine-Readable IC KPI Scorecard CLI
 *
 * Usage:
 *   npx tsx scripts/poly-g7-scorecard.ts
 *   npx tsx scripts/poly-g7-scorecard.ts --input path/to/scorecard-input.json
 *
 * Without `--input`, inspects workspace empirical sample directories (defaulting
 * fail-closed to 0 recorded L2 WAL days, 0 qualifying maker fills, and 0 resolved
 * OOS forecasts) and prints the machine-readable JSON scorecard to stdout.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  evaluateICKpiScorecard,
  type ICEmpiricalSamples,
  type ICScorecardInput,
} from '../src/desk/polymarket/ic-kpi-scorecard';

function inspectWorkspaceEmpiricalSamples(cwd: string): ICEmpiricalSamples {
  const l2WalDir = resolve(cwd, 'data/polymarket/l2-wal');
  let recordedL2Days = 0;
  if (existsSync(l2WalDir)) {
    const entries = readdirSync(l2WalDir);
    const distinctDays = new Set(
      entries
        .map((name) => /^(\d{4}-\d{2}-\d{2})\.(?:jsonl|ndjson|wal)$/i.exec(name)?.[1])
        .filter((day): day is string => typeof day === 'string'),
    );
    recordedL2Days = distinctDays.size;
  }
  return {
    recordedL2Days,
    qualifyingMakerFills: 0,
    resolvedOosForecasts: 0,
  };
}

function parseInputPath(argv: readonly string[]): string | null {
  const idx = argv.indexOf('--input');
  if (idx === -1) return null;
  const candidate = argv[idx + 1];
  if (!candidate || candidate.startsWith('--')) {
    throw new Error('Missing JSON file path after --input');
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
  const inputPath = parseInputPath(process.argv.slice(2));
  const scorecardInput: ICScorecardInput = inputPath
    ? loadInputFromJson(inputPath)
    : {
        mode: 'sim',
        strategyClass: 'mm',
        samples: inspectWorkspaceEmpiricalSamples(process.cwd()),
      };
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
