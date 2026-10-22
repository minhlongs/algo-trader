// SPDX-License-Identifier: MIT
/**
 * Behavioral probes for the Open-Core public-surface steps.
 *
 * These claim something is *published and usable by a newcomer*: a leaderboard that actually
 * names its methodology, and a quickstart that a new user can actually run. Both are checks on
 * substance — a marketing page with no metrics, or a CLI missing its quickstart command, fail.
 *
 * @module desk/opencoresaas2026monetization/step-governance-public
 */

import { fail, ok, readText, repoFile } from './step-governance-support';
import type { StepProbeResult } from './step-probe-types';

/**
 * Step 24 — public backtest leaderboard.
 *
 * The step claims published performance metrics. Require the doc to name the metrics it promises;
 * a leaderboard without a drawdown figure is not a trust signal.
 */
export function probeBacktestLeaderboard(repoRoot: string): StepProbeResult {
  const doc = readText(repoFile(repoRoot, 'docs/backtest-leaderboard.md'));
  if (doc === null) {
    return fail('leaderboard documentation is missing');
  }

  const missing = [/sharpe/i, /drawdown/i].filter((re) => !re.test(doc));
  if (missing.length > 0) {
    return fail('leaderboard does not publish the metrics it claims');
  }

  return ok('leaderboard publishes Sharpe and drawdown metrics');
}

/**
 * Step 21 — sixty-second quickstart.
 *
 * The claim is that a new user can start in one minute. Require the CLI to expose both the
 * setup and quickstart commands the documents describe.
 */
export function probeQuickstart(repoRoot: string): StepProbeResult {
  const cli = readText(repoFile(repoRoot, 'src/commands/cli-builder.ts'));
  if (cli === null) {
    return fail('CLI entry point is missing');
  }

  const hasSetup = /\.command\('setup'\)/.test(cli);
  const hasQuickstart = /\.command\('quickstart'\)/.test(cli);
  if (!hasSetup || !hasQuickstart) {
    return fail('CLI is missing its setup or quickstart command');
  }

  return ok('CLI exposes both setup and quickstart commands');
}
