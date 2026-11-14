/**
 * CLI entrypoint for `npm run kpi:poly`.
 *
 * Computes and prints all 11 Polymarket Quant Alpha governance KPIs on
 * provenance-verified observed data (`recorded-l2`, `data-api-v2`,
 * `prices-history`) in paper mode only.
 */

import { collectPolymarketKpiInput } from '../src/desk/cli/kpi-poly-collector';
import { evaluatePolymarketKpis } from '../src/desk/cli/kpi-poly-evaluators';
import { formatKpiEvaluationReport } from '../src/desk/cli/kpi-poly-formatter';

interface CliFlags {
  days?: number;
  recordMs?: number;
  l2Dir?: string;
  json: boolean;
}

function parseCliFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--days' && argv[i + 1]) {
      flags.days = Number(argv[++i]);
    } else if (arg === '--record-ms' && argv[i + 1]) {
      flags.recordMs = Number(argv[++i]);
    } else if (arg === '--l2-dir' && argv[i + 1]) {
      flags.l2Dir = argv[++i];
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseCliFlags(process.argv.slice(2));
  const input = await collectPolymarketKpiInput({
    ...(flags.days !== undefined && Number.isFinite(flags.days) ? { days: flags.days } : {}),
    ...(flags.recordMs !== undefined && Number.isFinite(flags.recordMs)
      ? { recordMs: flags.recordMs }
      : {}),
    ...(flags.l2Dir ? { l2Dir: flags.l2Dir } : {}),
  });
  const report = evaluatePolymarketKpis(input);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatKpiEvaluationReport(report));
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[kpi:poly] ERROR: ${message}\n`);
  process.exitCode = 1;
});
