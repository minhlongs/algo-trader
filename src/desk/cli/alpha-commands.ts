/**
 * Alpha CLI Commands — Alpha Discovery Engine CLI interface.
 *
 * Registers subcommands under `cashclaw alpha`:
 *   candidates, discover, backtest, walkforward, compare, report, ablation, robustness
 *
 * Each delegates to existing alpha-lab modules — no logic reimplemented here.
 */
import type { Command } from 'commander';
import { logger } from '../../shared/utils/logger';
import { handleCandidates } from './alpha-candidates-handler';
import { handleDiscover } from './alpha-discover-handler';
import { handleBacktest } from './alpha-backtest-handler';
import { handleWalkforward } from './alpha-walkforward-handler';
import { handleCompare } from './alpha-compare-handler';
import { handleReport } from './alpha-report-handler';
import { handleAblation } from './alpha-ablation-handler';
import { handleRobustness } from './alpha-robustness-handler';

// ── Register all alpha subcommands ──────────────────────────────────────────

export function registerAlphaCommands(alphaCmd: Command): void {
  // ── alpha candidates ────────────────────────────────────────────────────

  alphaCmd
    .command('candidates')
    .description('List available experiment configs and baselines')
    .option('--json', 'Machine-readable JSON output')
    .action((opts: { json?: boolean }) => {
      try {
        handleCandidates(opts);
      } catch (err) {
        logger.error('Failed to list candidates:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha discover ──────────────────────────────────────────────────────

  alphaCmd
    .command('discover <symbol>')
    .description('Run discovery pass: evaluate all configs for a symbol')
    .option('--tf <timeframe>', 'Candle timeframe', '1h')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (symbol: string, opts: { tf: string; json?: boolean; output?: string }) => {
      try {
        await handleDiscover(symbol, opts);
      } catch (err) {
        logger.error('Discover failed:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha backtest ──────────────────────────────────────────────────────

  alphaCmd
    .command('backtest <experiment>')
    .description('Run a single experiment and show result metrics')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (experiment: string, opts: { json?: boolean; output?: string }) => {
      try {
        await handleBacktest(experiment, opts);
      } catch (err) {
        logger.error('Backtest failed:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha walkforward ───────────────────────────────────────────────────

  alphaCmd
    .command('walkforward <experiment>')
    .description('Run walk-forward evaluation showing step-by-step results')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (experiment: string, opts: { json?: boolean; output?: string }) => {
      try {
        await handleWalkforward(experiment, opts);
      } catch (err) {
        logger.error('Walk-forward failed:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha compare ───────────────────────────────────────────────────────

  alphaCmd
    .command('compare <experiment-a> <experiment-b>')
    .description('Run two experiments and show side-by-side comparison')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (expA: string, expB: string, opts: { json?: boolean; output?: string }) => {
      try {
        await handleCompare(expA, expB, opts);
      } catch (err) {
        logger.error('Compare failed:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha report ────────────────────────────────────────────────────────

  alphaCmd
    .command('report <experiment>')
    .description('Run experiment and show full evaluation report with breakdowns')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (experiment: string, opts: { json?: boolean; output?: string }) => {
      try {
        await handleReport(experiment, opts);
      } catch (err) {
        logger.error('Report failed:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha ablation ──────────────────────────────────────────────────────

  alphaCmd
    .command('ablation <experiment>')
    .description('Drop each feature one at a time and report incremental contribution')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (experiment: string, opts: { json?: boolean; output?: string }) => {
      try {
        await handleAblation(experiment, opts);
      } catch (err) {
        logger.error('Ablation failed:', (err as Error).message);
        process.exit(1);
      }
    });

  // ── alpha robustness ────────────────────────────────────────────────────

  alphaCmd
    .command('robustness <experiment>')
    .description('Run experiment under NORMAL/CONSERVATIVE/ADVERSE/EXTREME cost stress')
    .option('--json', 'Machine-readable JSON output')
    .option('--output <file>', 'Write results to a JSON file')
    .action(async (experiment: string, opts: { json?: boolean; output?: string }) => {
      try {
        await handleRobustness(experiment, opts);
      } catch (err) {
        logger.error('Robustness test failed:', (err as Error).message);
        process.exit(1);
      }
    });
}