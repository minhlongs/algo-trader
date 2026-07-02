/**
 * Run-All-Backtests — Iterate all registered strategies, run a 30-day backtest
 * for each viable strategy, and write results to CSV.
 *
 * Usage:
 *    cd /Users/macbook/algo-trader && pnpm exec tsx scripts/run-all-backtests.ts
 *
 * Output: reports/backtest-results.csv
 */

import { listStrategies } from '../src/desk/polymarket/strategy-registry';
import { BacktestRunner } from '../src/desk/backtesting/backtest-runner';
import * as fs from 'fs';
import * as path from 'path';

// ── Strategy selection ──────────────────────────────────────────────────

const EXCLUDED_STRATEGIES = new Set([
  // Event-driven / manual — not suitable for automated backtesting
  'resolution-frontrunner',   // relies on event deadline proximity
  'listing-arbitrage-sniper', // relies on new listings
]);

// Max 5 minutes per strategy before skipping (timeout)
const PER_STRATEGY_TIMEOUT_MS = 5 * 60 * 1000;

// ── CSV Header ───────────────────────────────────────────────────────────

const CSV_HEADER = [
  'strategy',
  'sharpe_ratio',
  'win_rate_pct',
  'total_pnl_usd',
  'profit_factor',
  'max_drawdown_pct',
  'total_trades',
  'winning_trades',
  'losing_trades',
  'avg_pnl_per_trade_usd',
  'best_trade_usd',
  'worst_trade_usd',
  'duration_ms',
  'status',
].join(',');

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const csvPath = path.join(reportsDir, 'backtest-results.csv');
  fs.writeFileSync(csvPath, CSV_HEADER + '\n');

  const allStrategies = listStrategies();
  const viable = allStrategies.filter((s) => !EXCLUDED_STRATEGIES.has(s.name));
  console.log(`\nStrategy Registry: ${allStrategies.length} total`);
  console.log(`Viable for backtest: ${viable.length} (${allStrategies.length - viable.length} excluded)`);
  console.log('─'.repeat(60));

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of viable) {
    console.log(`\n  [${completed + failed + skipped + 1}/${viable.length}] ${entry.name}`);
    console.log(`    ${entry.description}`);

    const runner = new BacktestRunner();
    try {
      // Run with per-strategy timeout
      const result = await Promise.race([
        runner.run({
          strategy: entry.name,
          paperTrading: true,
          capitalUsdc: 5000,
          days: 30,
        }),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), PER_STRATEGY_TIMEOUT_MS)
        ),
      ]);

      // If result is null (timeout), handled by catch
      if (!result) {
        failed++;
        continue;
      }

      const m = result.metrics;

      // Round values for CSV
      const row = [
        entry.name,
        m.sharpeRatio.toFixed(4),
        (m.winRate * 100).toFixed(2),
        m.totalPnl.toFixed(2),
        m.profitFactor === Infinity ? 'Infinity' : m.profitFactor.toFixed(4),
        (Math.abs(m.maxDrawdown) * 100).toFixed(2),
        m.totalTrades,
        m.winningTrades,
        m.losingTrades,
        m.avgPnlPerTrade.toFixed(2),
        m.bestTrade.toFixed(2),
        m.worstTrade.toFixed(2),
        result.durationMs,
        'OK',
      ].join(',');

      fs.appendFileSync(csvPath, row + '\n');
      completed++;

      console.log(`    Result: Sharpe=${m.sharpeRatio.toFixed(2)} | Win=${(m.winRate * 100).toFixed(1)}% | PnL=$${m.totalPnl.toFixed(2)} | DD=${(Math.abs(m.maxDrawdown) * 100).toFixed(1)}% | Trades=${m.totalTrades} | Dur=${(result.durationMs / 1000).toFixed(0)}s`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const reason = errMsg === 'TIMEOUT' ? 'TIMEOUT (>5min)' : errMsg.slice(0, 60);

      const row = [entry.name, '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', reason].join(',');
      fs.appendFileSync(csvPath, row + '\n');

      if (errMsg === 'TIMEOUT') {
        skipped++;
        console.log(`    ${reason} — skipped`);
      } else {
        failed++;
        console.error(`    FAILED: ${reason}`);
      }
    } finally {
      runner.clearCache();
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Backtest batch complete: ${completed} OK, ${failed} failed, ${skipped} timed out`);
  console.log(`CSV written to: ${csvPath}`);

  // Summary of top performers
  console.log('\n── Top 5 by Sharpe Ratio ──');
  try {
    const csv = fs.readFileSync(csvPath, 'utf-8');
    const lines = csv.trim().split('\n').slice(1);
    const parsed = lines
      .map((l) => l.split(','))
      .filter((cols) => cols[14] === 'OK') // status field
      .map((cols) => ({ name: cols[0], sharpe: parseFloat(cols[1]) }))
      .sort((a, b) => b.sharpe - a.sharpe)
      .slice(0, 5);
    for (const s of parsed) {
      console.log(`  ${s.name}: Sharpe=${s.sharpe.toFixed(2)}`);
    }
  } catch {
    console.log('  (could not parse results)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
