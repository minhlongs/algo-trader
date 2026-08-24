/**
 * Experiment Runner CLI
 *
 * Usage: pnpm tsx src/alpha-lab/run-experiment.ts --config <path> [--record] [--suggest]
 *        pnpm tsx src/alpha-lab/run-experiment.ts --suggest
 *
 * Runs the full pipeline (split -> label -> evaluate) and outputs JSON to
 * stdout. --record persists the alpha verdict (provenance to stderr only).
 * --suggest ranks strategy families against the research ledger.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExperimentConfig, SplitMetrics } from './experiments/experiment-types';
import { runExperiment } from './experiments/experiment-engine';
import { loadCandles } from './experiments/alpha-backtest-adapter';
import { computeRegimeSeries, distinctRegimes } from './regimes/regime-series';
import type { MarketRegime } from './regimes/regime-types';
import { runAllBaselines } from './baselines/baseline-runner';
import { candidateResultFromExperiment, recordAlphaVerdict } from './provenance/record-alpha-verdict';
import { hashConfig } from './provenance/run-card';
import { loadVerdictSummary, type VerdictSummary } from './provenance/verdict-summary';
import { DEFAULT_LEDGER_PATH } from './provenance/research-ledger';
import { createDefaultRegistry } from './alpha-discovery/strategy-family-registry';
import { prioritizeFamilies, type PrioritizedFamily } from './alpha-discovery/research-informed';
interface CliArgs {
  configPath?: string;
  record: boolean;
  suggest: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const idx = argv.indexOf('--config');
  const configPath = idx !== -1 && argv[idx + 1] ? argv[idx + 1]! : undefined;
  const suggest = argv.includes('--suggest');
  if (!configPath && !suggest) {
    throw new Error(
      'Usage: run-experiment --config <path-to-config.json> [--record] [--suggest]\n' +
      '       run-experiment --suggest',
    );
  }
  return { configPath, record: argv.includes('--record'), suggest };
}

// ── Suggest Mode ─────────────────────────────────────────────────────────────
/** Rank families against the ledger. Returns data — callers own diagnostics. */
async function suggestFamilies(
  ledgerPath: string,
): Promise<{ summary: VerdictSummary; suggestions: PrioritizedFamily[] }> {
  const summary = await loadVerdictSummary(ledgerPath);
  const registry = createDefaultRegistry();
  const suggestions = prioritizeFamilies(registry, summary);
  return { summary, suggestions };
}
// ── Config Validation ────────────────────────────────────────────────────────

function validateConfig(config: ExperimentConfig): void {
  if (!config.experimentId) throw new Error('Missing experimentId');
  if (!config.symbol) throw new Error('Missing symbol');
  if (!config.timeframe) throw new Error('Missing timeframe');
  if (!Array.isArray(config.features) || config.features.length === 0) {
    throw new Error('Features must be a non-empty array');
  }
  if (typeof config.tp !== 'number' || config.tp <= 0) {
    throw new Error('tp must be a positive number');
  }
  if (typeof config.sl !== 'number' || config.sl <= 0) {
    throw new Error('sl must be a positive number');
  }
  if (!config.split || typeof config.split.trainRatio !== 'number') {
    throw new Error('Invalid split config');
  }
}
// ── Helpers ──────────────────────────────────────────────────────────────────
/** Pick the 8 metric fields shared across every artifact split. */
function pickMetrics(m: SplitMetrics) {
  return {
    numTrades: m.numTrades,
    winRate: m.winRate,
    lossRate: m.lossRate,
    timeoutRate: m.timeoutRate,
    meanLabel: m.meanLabel,
    totalPnl: m.totalPnl,
    sharpeRatio: m.sharpeRatio,
    maxDrawdown: m.maxDrawdown,
  };
}
/** Map baseline reports to artifact shape. */
function mapBaselines(baselines: ReturnType<typeof runAllBaselines>, regimeSeries: MarketRegime[]) {
  const regimesPresent = distinctRegimes(regimeSeries);
  return baselines.map((b) => ({
    name: b.name,
    totalPnl: b.report.totalPnl,
    winRate: b.report.winRate,
    lossRate: b.report.losingTrades / Math.max(1, b.report.totalTrades),
    totalTrades: b.report.totalTrades,
    sharpeRatio: b.report.sharpeRatio,
    maxDrawdown: b.report.maxDrawdown,
    regimesPresent,
  }));
}
// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { configPath, record, suggest } = parseArgs(process.argv);
  // Standalone suggest mode: no --config required.
  if (suggest && !configPath) {
    process.stderr.write(
      `[run-experiment] suggest: loading ledger from ${DEFAULT_LEDGER_PATH}\n`,
    );
    const { summary, suggestions } = await suggestFamilies(DEFAULT_LEDGER_PATH);
    process.stderr.write(
      `[run-experiment] suggest: ${summary.totalRecords} ledger records across ` +
      `${Object.keys(summary.byStrategy).length} strategies; ` +
      `${suggestions.length} families ranked\n`,
    );
    process.stdout.write(JSON.stringify(suggestions, null, 2) + '\n');
    return;
  }

  if (!configPath) {
    throw new Error('--config <path> is required when --suggest is not used');
  }

  const config: ExperimentConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as ExperimentConfig;
  validateConfig(config);
  const minBars = Math.ceil(
    1 / (1 - config.split.trainRatio - config.split.valRatio - config.split.testRatio + 0.01) * 100,
  );
  const candleCount = Math.max(500, minBars * 3);
  const { candles, source } = await loadCandles(config.symbol, config.timeframe, candleCount);
  const result = runExperiment({
    candles,
    config,
    ...(record
      ? {
          runCardDir: join('data', 'runs', config.experimentId),
          // CLI runs are classified in-sample per standing doctrine;
          // OOS callers must pass resultClass explicitly elsewhere.
          resultClass: 'IS' as const,
        }
      : {}),
  });
  const baselines = runAllBaselines(candles, config.cost.feeBps, config.cost.slippageBps, config.seed);
  const regimeSeries = computeRegimeSeries(candles, {
    market: config.symbol,
    timeframe: config.timeframe,
    lookback: config.lookback,
  });
  const artifact = {
    experimentId: result.config.experimentId,
    symbol: result.config.symbol,
    timeframe: result.config.timeframe,
    dataSource: source,
    totalBars: result.totalBars,
    numSteps: result.numSteps,
    metrics: {
      train: pickMetrics(result.metrics.train),
      val: pickMetrics(result.metrics.val),
      test: pickMetrics(result.metrics.test),
    },
    baselines: mapBaselines(baselines, regimeSeries),
  };
  // Provenance (--record): persist alpha verdict + ledger entry.
  if (record) {
    const candidate = candidateResultFromExperiment(result);
    const outcome = await recordAlphaVerdict({
      candidateId: config.experimentId,
      runId: config.experimentId,
      configHash: hashConfig(config as unknown as Record<string, unknown>),
      strategyRef: config.features.join('+') || 'experiment',
      candidate,
      candles,
      resultClass: 'IS',
    });
    process.stderr.write(
      JSON.stringify({
        recorded: outcome.ok,
        alphaSurvival: outcome.verdict.passed,
        candidateId: config.experimentId,
        ledgerOk: outcome.ledger.ok,
      }) + '\n',
    );
  }

  // Suggest mode combined with --config: append suggestedNext to artifact.
  if (suggest) {
    const { suggestions } = await suggestFamilies(DEFAULT_LEDGER_PATH);
    (artifact as Record<string, unknown>).suggestedNext = suggestions
      .filter((s) => s.reason !== 'passed-demoted')
      .slice(0, 5)
      .map((s) => s.familyId);
  }

  process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[run-experiment] fatal', { err });
  process.exit(1);
});
