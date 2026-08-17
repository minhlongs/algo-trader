/**
 * Experiment Runner CLI
 *
 * Usage: pnpm tsx src/alpha-lab/run-experiment.ts --config <path>
 *
 * Loads a JSON experiment config, generates mock candle data for the
 * configured symbol/timeframe, runs the full pipeline (split -> label ->
 * evaluate), and outputs the result artifact as JSON to stdout.
 */

import { readFileSync } from 'node:fs';
import type { ExperimentConfig } from './experiments/experiment-types';
import { runExperiment } from './experiments/experiment-engine';
import type { CandleLike } from './regimes/regime-types';

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

// ── Mock Candle Generator ────────────────────────────────────────────────────

function generateMockCandles(symbol: string, count: number): CandleLike[] {
  const basePrice = symbol.includes('BTC') ? 60000 : symbol.includes('ETH') ? 3500 : 150;
  const candles: CandleLike[] = [];
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    const drift = (Math.random() - 0.48) * basePrice * 0.008;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + Math.abs(drift) * 0.3;
    const low = Math.min(open, close) - Math.abs(drift) * 0.3;
    const volume = 1000 + Math.random() * 5000;

    candles.push({
      timestamp: new Date(Date.UTC(2025, 0, 1, i)).toISOString(),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: round(volume),
    });

    price = close;
  }
  return candles;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const configPath = parseArgs(process.argv);
  const raw = readFileSync(configPath, 'utf-8');
  const config: ExperimentConfig = JSON.parse(raw) as ExperimentConfig;

  validateConfig(config);

  const minBars = Math.ceil(
    1 / (1 - config.split.trainRatio - config.split.valRatio - config.split.testRatio + 0.01) * 100,
  );
  const candleCount = Math.max(500, minBars * 3);
  const candles = generateMockCandles(config.symbol, candleCount);

  const result = runExperiment({ candles, config });

  const artifact = {
    experimentId: result.config.experimentId,
    symbol: result.config.symbol,
    timeframe: result.config.timeframe,
    totalBars: result.totalBars,
    numSteps: result.numSteps,
    metrics: {
      train: result.metrics.train,
      val: result.metrics.val,
      test: result.metrics.test,
    },
  };

  process.stdout.write(JSON.stringify(artifact, null, 2) + '\n');
}

main();
