/**
 * Governance CLI entrypoint (`npx tsx scripts/poly-governance-audit.ts`).
 *
 * Runs:
 *  1. Agent #5 CI Backtest Integrity & Anti-Leakage Auditor across `src/desk/`
 *  2. Agent #6 EOD Execution Monitoring & Microstructure Diagnostics self-check
 *  3. Agent #8 10-Repository Polymarket Ecosystem Watchlist inventory (or `--live-watchlist`)
 */

import {
  POLYMARKET_UPSTREAM_WATCHLIST,
  diffWatchlistSnapshots,
  evaluateEodExecutionDiagnostics,
  fetchGitHubWatchlistStates,
  runRepositoryBacktestAudit,
  type RepoRemoteState,
} from '../src/desk/governance';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const liveWatchlist = argv.includes('--live-watchlist');

  const backtestAudit = runRepositoryBacktestAudit(process.cwd());
  const eodSample = evaluateEodExecutionDiagnostics({
    tradingDateIso: new Date().toISOString().slice(0, 10),
    markouts: [],
    cancelAckLatenciesMs: [],
    totalCancels: 0,
    totalFills: 0,
    postOnlySubmitted: 0,
    postOnlyRejected: 0,
    restingOrdersSampled: 0,
    restingOrdersScoring: 0,
    heartbeatMisses: 0,
    http425CooldownCount: 0,
    ghostFillCount: 0,
  });

  const baselineMap = new Map<string, RepoRemoteState>(
    POLYMARKET_UPSTREAM_WATCHLIST.map((r) => [
      r.slug,
      { slug: r.slug, latestTag: 'vendored-baseline', headSha: 'main', pushedAtIso: null },
    ]),
  );
  const observedMap = liveWatchlist
    ? await fetchGitHubWatchlistStates(POLYMARKET_UPSTREAM_WATCHLIST)
    : baselineMap;
  const watchlistReport = diffWatchlistSnapshots(baselineMap, observedMap);

  const summary = {
    ok: backtestAudit.passed,
    backtestAudit,
    eodDiagnostics: eodSample,
    watchlist: {
      repoCount: watchlistReport.repoCount,
      driftCount: watchlistReport.driftCount,
      unreachableCount: watchlistReport.unreachableCount,
      repos: watchlistReport.items.map((i) => ({ slug: i.slug, category: i.category, changeKind: i.changeKind })),
    },
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(
      `[poly-governance-audit] Backtest Integrity: ${backtestAudit.passed ? 'PASS' : 'FAIL'} ` +
        `(scanned=${backtestAudit.scannedFiles}, findings=${backtestAudit.findings.length})\n` +
        `[poly-governance-audit] EOD Diagnostics Baseline: ${eodSample.status}\n` +
        `[poly-governance-audit] Watchlist Coverage: ${watchlistReport.repoCount}/10 canonical repos ` +
        `(drift=${watchlistReport.driftCount}, unreachable=${watchlistReport.unreachableCount})\n`,
    );
  }

  if (!backtestAudit.passed) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[poly-governance-audit] ERROR: ${msg}\n`);
  process.exitCode = 1;
});
