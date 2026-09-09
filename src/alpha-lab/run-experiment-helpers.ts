/**
 * Run Experiment Helpers
 *
 * Validation, argument parsing, metric picking, and baseline mapping
 * for the run-experiment CLI.
 */

import type { ExperimentConfig, SplitMetrics } from './experiments/experiment-types';
import { distinctRegimes } from './regimes/regime-series';
import type { MarketRegime } from './regimes/regime-types';
import type { runAllBaselines } from './baselines/baseline-runner';
import { loadVerdictSummary, type VerdictSummary } from './provenance/verdict-summary';
import { createDefaultRegistry } from './alpha-discovery/strategy-family-registry';
import { prioritizeFamilies, type PrioritizedFamily } from './alpha-discovery/research-informed';

export interface CliArgs {
  configPath?: string;
  record: boolean;
  suggest: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
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

/** Rank families against the ledger. Returns data — callers own diagnostics. */
export async function suggestFamilies(
  ledgerPath: string,
): Promise<{ summary: VerdictSummary; suggestions: PrioritizedFamily[] }> {
  const summary = await loadVerdictSummary(ledgerPath);
  const registry = createDefaultRegistry();
  const suggestions = prioritizeFamilies(registry, summary);
  return { summary, suggestions };
}

export function validateConfig(config: ExperimentConfig): void {
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

/** Pick the 8 metric fields shared across every artifact split. */
export function pickMetrics(m: SplitMetrics) {
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
export function mapBaselines(
  baselines: ReturnType<typeof runAllBaselines>,
  regimeSeries: MarketRegime[],
) {
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
