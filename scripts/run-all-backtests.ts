/**
 * Run-All-Backtests — Iterate all registered strategies, run a 30-day backtest
 * for a representative sample, and write results to CSV.
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

// ── Representative sample: 10 strategies covering diverse approaches ──────────

const SAMPLE_STRATEGIES = [
  'spread-mean-reversion',
  'bollinger-squeeze',
  'momentum-cascade',
  'vwap-deviation-sniper',
  'whale-tracker',
  'orderbook-depth-ratio',
  'tail-risk-harvester',
  'volatility-targeting',
  'mean-variance-optimizer',
  'cluster-breakout',
];

// ── CSV Header ───────────────────────────────────────────────────────────────

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
  'avg_win_usd',
  'avg_loss_usd',
  'best_trade_usd',
  'worst_trade_usd',
  'duration_ms',
  'status',
].join(',');

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const csvPath = path.join(reportsDir, 'backtest-results.csv');
  // Write header (overwrite)
  fs.writeFileSync(csvPath, CSV_HEADER + '\n');

  const allStrategies = listStrategies();
  console.log(`\nStrategy Registry: ${allStrategies.length} strategies total`);
  console.log(`Running representative sample (${SAMPLE_STRATEGIES.length} strategies)`);
  console.log('─'.repeat(60));

  let completed = 0;
  let failed = 0;

  for (const name of SAMPLE_STRATEGIES) {
    const entry = allStrategies.find((s) => s.name === name);
    if (!entry) {
      console.log(`  [SKIP] ${name} — not found in registry`);
      const row = [name, '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', 'SKIPPED'].join(',');
      fs.appendFileSync(csvPath, row + '\n');
      continue;
    }

    console.log(`\n  [${completed + failed + 1}/${SAMPLE_STRATEGIES.length}] Backtesting ${name}...`);
    console.log(`    ${entry.description}`);

    const runner = new BacktestRunner();
    try {
      const result = await runner.run({
        strategy: name,
        paperTrading: true,
        capitalUsdc: 5000,
        days: 30,
      });

      const m = result.metrics;

      // Round values for CSV
      const row = [
        name,
        m.sharpeRatio.toFixed(4),
        (m.winRate * 100).toFixed(2),
        m.totalPnl.toFixed(2),
        m.profitFactor === Infinity ? 'Infinity' : m.profitFactor.toFixed(4),
        (Math.abs(m.maxDrawdown) * 100).toFixed(2),
        m.totalTrades,
        m.winningTrades,
        m.losingTrades,
        m.avgPnlPerTrade.toFixed(2),
        // We don't have avgWinUsd/avgLossUsd in MetricsReport, compute from total
        // Best/worst from MetricsReport
        m.bestTrade.toFixed(2),
        m.worstTrade.toFixed(2),
        result.durationMs,
        'OK',
      ].join(',');

      fs.appendFileSync(csvPath, row + '\n');
      completed++;

      console.log(`    Result: Sharpe=${m.sharpeRatio.toFixed(2)} | Win=${(m.winRate * 100).toFixed(1)}% | PnL=$${m.totalPnl.toFixed(2)} | DD=${(Math.abs(m.maxDrawdown) * 100).toFixed(1)}% | Trades=${m.totalTrades}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`    FAILED: ${errMsg}`);
      failed++;

      const row = [name, '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', `ERROR: ${errMsg.slice(0, 40)}`].join(',');
      fs.appendFileSync(csvPath, row + '\n');
    } finally {
      runner.clearCache();
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Backtest batch complete: ${completed} OK, ${failed} failed, ${SAMPLE_STRATEGIES.length - completed - failed} skipped`);
  console.log(`CSV written to: ${csvPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
