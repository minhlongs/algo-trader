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
import type { ExperimentConfig } from './experiments/experiment-types';
import { runExperiment } from './experiments/experiment-engine';
import { loadCandles, buildDataSources } from './experiments/alpha-backtest-adapter';
import { computeRegimeSeries } from './regimes/regime-series';
import { runAllBaselines } from './baselines/baseline-runner';
import {
  candidateResultFromExperiment,
  recordAlphaVerdict,
} from './provenance/record-alpha-verdict';
import { hashConfig } from './provenance/run-card';
import { DEFAULT_LEDGER_PATH } from './provenance/research-ledger';
import type { DataSourceProvenance } from './provenance/run-card';
import {
  parseArgs,
  suggestFamilies,
  validateConfig,
  pickMetrics,
  mapBaselines,
  type CliArgs,
} from './run-experiment-helpers';

export {
  parseArgs,
  suggestFamilies,
  validateConfig,
  pickMetrics,
  mapBaselines,
  type CliArgs,
};

export interface RunExperimentIO {
  stdout: { write: (msg: string) => void };
  stderr: { write: (msg: string) => void };
}

export async function runExperimentCli(
  argv: string[] = process.argv,
  io: RunExperimentIO = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const { configPath, record, suggest } = parseArgs(argv);

  // Standalone suggest mode: no --config required.
  if (suggest && !configPath) {
    io.stderr.write(
      `[run-experiment] suggest: loading ledger from ${DEFAULT_LEDGER_PATH}\n`,
    );
    const { summary, suggestions } = await suggestFamilies(DEFAULT_LEDGER_PATH);
    io.stderr.write(
      `[run-experiment] suggest: ${summary.totalRecords} ledger records across ` +
      `${Object.keys(summary.byStrategy).length} strategies; ` +
      `${suggestions.length} families ranked\n`,
    );
    io.stdout.write(JSON.stringify(suggestions, null, 2) + '\n');
    return 0;
  }

  const config: ExperimentConfig = JSON.parse(
    readFileSync(configPath!, 'utf-8'),
  ) as ExperimentConfig;
  validateConfig(config);

  const minBars = Math.ceil(
    (1 / (1 - config.split.trainRatio - config.split.valRatio - config.split.testRatio + 0.01)) * 100,
  );
  const candleCount = Math.max(500, minBars * 3);
  const { candles, source } = await loadCandles(config.symbol, config.timeframe, candleCount);

  // Construct data source provenance (funding series get their real provider
  // label + transform description via the shared adapter helper).
  const dataSources: DataSourceProvenance[] = buildDataSources(
    config.symbol,
    config.timeframe,
    candles,
    source,
  );

  const result = runExperiment({
    candles,
    config,
    dataSources,
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
    io.stderr.write(
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

  io.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
  return 0;
}

export async function main(
  runner: (argv?: string[], io?: RunExperimentIO) => Promise<number> = runExperimentCli,
): Promise<void> {
  const exitCode = await runner();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

/* v8 ignore start */
if (require.main === module) {
  main().catch((err) => {
    console.error('[run-experiment] fatal', { err });
    process.exit(1);
  });
}
/* v8 ignore stop */
