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
      train: {
        numTrades: result.metrics.train.numTrades,
        winRate: result.metrics.train.winRate,
        lossRate: result.metrics.train.lossRate,
        timeoutRate: result.metrics.train.timeoutRate,
        meanLabel: result.metrics.train.meanLabel,
        totalPnl: result.metrics.train.totalPnl,
        sharpeRatio: result.metrics.train.sharpeRatio,
        maxDrawdown: result.metrics.train.maxDrawdown,
      },
      val: {
        numTrades: result.metrics.val.numTrades,
        winRate: result.metrics.val.winRate,
        lossRate: result.metrics.val.lossRate,
        timeoutRate: result.metrics.val.timeoutRate,
        meanLabel: result.metrics.val.meanLabel,
        totalPnl: result.metrics.val.totalPnl,
        sharpeRatio: result.metrics.val.sharpeRatio,
        maxDrawdown: result.metrics.val.maxDrawdown,
      },
      test: {
        numTrades: result.metrics.test.numTrades,
        winRate: result.metrics.test.winRate,
        lossRate: result.metrics.test.lossRate,
        timeoutRate: result.metrics.test.timeoutRate,
        meanLabel: result.metrics.test.meanLabel,
        totalPnl: result.metrics.test.totalPnl,
        sharpeRatio: result.metrics.test.sharpeRatio,
        maxDrawdown: result.metrics.test.maxDrawdown,
      },
    },
    baselines: baselines.map((b) => ({
      name: b.name,
      totalPnl: b.report.totalPnl,
      winRate: b.report.winRate,
      lossRate: b.report.losingTrades / Math.max(1, b.report.totalTrades),
      totalTrades: b.report.totalTrades,
      sharpeRatio: b.report.sharpeRatio,
      maxDrawdown: b.report.maxDrawdown,
      // Baselines produce trades, not triple-barrier labels, so timeoutRate and
      // meanLabel are not defined for them — they are omitted rather than
      // fabricated as zeros. regimesPresent is empty because baselines are not
      // regime-filtered.
      regimesPresent: [],
    })),
  };

  process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
}

main().catch((err) => {
  console.error('[run-experiment] fatal', { err });
  process.exit(1);
});