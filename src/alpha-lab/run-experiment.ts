/**
 * Experiment Runner CLI
 *
 * Usage: pnpm tsx src/alpha-lab/run-experiment.ts --config <path>
 *
 * Loads a JSON experiment config, loads candle data (real OHLCV from the
 * store when available, mock random-walk fallback otherwise), runs the full
 * pipeline (split -> label -> evaluate), and outputs the result artifact as
 * JSON to stdout.
 *
 * The artifact always records `dataSource` so mock results are never mistaken
 * for real out-of-sample evidence.
 */

import { readFileSync } from 'node:fs';
import type { ExperimentConfig } from './experiments/experiment-types';
import { runExperiment } from './experiments/experiment-engine';
import { loadCandles } from './experiments/alpha-backtest-adapter';
import { runAllBaselines } from './baselines/baseline-runner';

// ── CLI Argument Parsing ─────────────────────────────────────────────────────

function parseArgs(argv: string[]): string {
  const idx = argv.indexOf('--config');
  if (idx === -1 || !argv[idx + 1]) {
    throw new Error('Usage: run-experiment --config <path-to-config.json>');
  }
  return argv[idx + 1]!;
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const configPath = parseArgs(process.argv);
  const raw = readFileSync(configPath, 'utf-8');
  const config: ExperimentConfig = JSON.parse(raw) as ExperimentConfig;

  validateConfig(config);

  const minBars = Math.ceil(
    1 / (1 - config.split.trainRatio - config.split.valRatio - config.split.testRatio + 0.01) * 100,
  );
  const candleCount = Math.max(500, minBars * 3);

  const { candles, source } = await loadCandles(config.symbol, config.timeframe, candleCount);

  const result = runExperiment({ candles, config });

  // Run baselines on the same dataset for apples-to-apples comparison.
  const baselines = runAllBaselines(
    candles,
    config.cost.feeBps,
    config.cost.slippageBps,
    config.seed,
  );

  const artifact = {
    experimentId: result.config.experimentId,
    symbol: result.config.symbol,
    timeframe: result.config.timeframe,
    dataSource: source, // 'real' | 'mock' — never claim real results from mock data
    totalBars: result.totalBars,
    numSteps: result.numSteps,
    metrics: {
      train: result.metrics.train,
      val: result.metrics.val,
      test: result.metrics.test,
    },
    baselines: baselines.map((b) => ({
      name: b.name,
      totalPnl: b.report.totalPnl,
      winRate: b.report.winRate,
      totalTrades: b.report.totalTrades,
      sharpeRatio: b.report.sharpeRatio,
      maxDrawdown: b.report.maxDrawdown,
    })),
  };

  process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[run-experiment] fatal', { err });
  process.exit(1);
});