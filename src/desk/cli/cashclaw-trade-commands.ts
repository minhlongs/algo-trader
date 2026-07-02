/**
 * CashClaw Trade Commands — CLI handlers for live/paper trading.
 *
 * Subcommands of `cashclaw trade`:
 *   start, status, list-strategies, run, journal, backtest
 */
import type { Command } from 'commander';
import { handleTradeRun } from './cashclaw-trade-run-handler';
import { handleTradeStart } from './cashclaw-trade-start-handler';

export function registerTradeCommands(tradeCmd: Command): void {

  // ── trade start ──────────────────────────────────────────────────────────────

  tradeCmd
    .command('start')
    .description('Start live or paper trading')
    .option('--mode <mode>', 'Trading mode: paper or live', 'paper')
    .option('--capital <amount>', 'Capital in USDC', '1000')
    .option('--strategy <name>', 'Strategy to run', 'endgame-v2')
    .option('--yes', 'Skip confirmation prompt (for scripting)')
    .action(async (opts: { mode: string; capital: string; strategy: string; yes: boolean }) => {
      await handleTradeStart(opts);
    });

  // ── trade status ─────────────────────────────────────────────────────────────

  tradeCmd
    .command('status')
    .description('Show live trading positions, P&L, and guard state')
    .option('--json', 'Machine-readable JSON output')
    .action((opts: { json: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify({
          mode: 'live',
          note: 'Status available when orchestrator is running. Use "trade start" first.',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      console.log('CashClaw Live Trading Status');
      console.log('─'.repeat(40));
      console.log('No live orchestrator running.');
      console.log('Start with: cashclaw trade start --mode=live --capital=1000');
      console.log('');
      console.log('Required env vars for LIVE mode:');
      const req: Array<{ newName: string; oldName: string; label: string }> = [
        { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY', label: 'API Key' },
        { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET', label: 'API Secret' },
        { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE', label: 'Passphrase' },
        { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY', label: 'Private Key' },
      ];
      for (const v of req) {
        const set = !!(process.env[v.newName] || process.env[v.oldName]);
        console.log(`  ${v.label}: ${set ? '✓ set' : '✗ missing'}`);
      }
    });

  // ── trade list-strategies ────────────────────────────────────────────────────

  tradeCmd
    .command('list-strategies')
    .description('List available V2 strategies for live trading')
    .action(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { listStrategies } = require('../polymarket/strategy-registry');
      const strategies = listStrategies();
      console.log('\nAvailable strategies for "algo trade run":\n');
      for (const s of strategies) {
        console.log(`  ${s.name}`);
        console.log(`    ${s.description}`);
      }
      console.log(`\n${strategies.length} strategies registered.`);
      console.log('Use: cashclaw trade run --strategy=<name>\n');
    });

  // ── trade run ────────────────────────────────────────────────────────────────

  tradeCmd
    .command('run')
    .description('Run a V2 strategy through live/paper trading pipeline')
    .option('--strategy <name>', 'Strategy to run (use list-strategies to see options)', 'spread-mean-reversion')
    .option('--mode <mode>', 'Trading mode: paper or live', 'paper')
    .option('--capital <amount>', 'Capital in USDC', '1000')
    .option('--ticks <n>', 'Number of ticks before auto-stop (0=unlimited)', '10')
    .option('--interval <ms>', 'Tick interval in milliseconds', '15000')
    .option('--yes', 'Skip confirmation prompt (for scripting)')
    .action(async (opts: { strategy: string; mode: string; capital: string; ticks: string; interval: string; yes: boolean }) => {
      await handleTradeRun(opts);
    });

  // ── trade journal ────────────────────────────────────────────────────────────

  tradeCmd
    .command('journal')
    .description('View live trading journal: fills, events, daily P&L')
    .option('--type <type>', 'Filter: fills, events, pnl, or all', 'all')
    .option('--limit <n>', 'Number of entries to show', '20')
    .action((opts: { type: string; limit: string }) => {
      const limit = parseInt(opts.limit, 10);
      const filter = opts.type;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LiveTradingJournal } = require('../execution/live-trading-journal');
      const journal = new LiveTradingJournal();

      if (filter === 'all' || filter === 'fills') {
        const fills = journal.loadFills();
        const recent = fills.slice(-limit);
        console.log(`\n📊 Fills (${fills.length} total, showing last ${recent.length}):`);
        console.log('─'.repeat(70));
        if (recent.length === 0) console.log('  No fills recorded yet.');
        for (const f of recent) {
          const dt = f.filledAt ? new Date(f.filledAt).toISOString() : 'unknown';
          console.log(`  ${dt} | ${f.side.padEnd(5)} | ${f.tokenId.slice(0, 12)} | size=${f.size} | price=$${f.price.toFixed(4)} | ${f.orderId}`);
        }
      }

      if (filter === 'all' || filter === 'events') {
        const events = journal.loadEvents();
        const recent = events.slice(-limit);
        console.log(`\n📋 Events (${events.length} total, showing last ${recent.length}):`);
        console.log('─'.repeat(70));
        if (recent.length === 0) console.log('  No events recorded yet.');
        for (const e of recent) {
          const dt = new Date(e.timestamp).toISOString();
          const data = JSON.stringify(e.data).slice(0, 60);
          console.log(`  ${dt} | ${e.type.padEnd(15)} | ${data}`);
        }
      }

      if (filter === 'all' || filter === 'pnl') {
        const pnl = journal.loadDailyPnl();
        console.log('\n💰 Daily P&L:');
        console.log('─'.repeat(40));
        if (pnl) {
          console.log(`  Date:       ${pnl.date}`);
          console.log(`  Realized:   $${pnl.realizedPnl.toFixed(2)}`);
          console.log(`  Trades:     ${pnl.tradeCount}`);
          console.log(`  Win/Loss:   ${pnl.winCount}W / ${pnl.lossCount}L`);
          if (pnl.tradeCount > 0) {
            const wr = ((pnl.winCount / pnl.tradeCount) * 100).toFixed(1);
            console.log(`  Win rate:   ${wr}%`);
          }
        } else {
          console.log('  No P&L recorded today.');
        }
      }

      if (filter === 'all') {
        const stats = journal.getLifetimeStats();
        console.log(`\n📈 Lifetime: ${stats.totalTrades} trades | ${stats.totalFills} fills`);
      }

      console.log('');
    });

  // ── trade backtest ───────────────────────────────────────────────────────────

  tradeCmd
    .command('backtest')
    .description('Backtest a strategy against historical Gamma market data')
    .option('--strategy <name>', 'Strategy to backtest (kebab-case name)', 'spread-mean-reversion')
    .option('--days <n>', 'Number of days of historical data', '30')
    .option('--capital <amount>', 'Starting capital in USDC', '5000')
    .option('--format <fmt>', 'Output format: table or json', 'table')
    .action(async (opts: { strategy: string; days: string; capital: string; format: string }) => {
      const days = parseInt(opts.days, 10);
      const capital = parseFloat(opts.capital);
      const { BacktestRunner } = await import('../backtesting/backtest-runner');
      const { listStrategies } = await import('../polymarket/strategy-registry');

      const available = listStrategies().map((s) => s.name);
      if (!available.includes(opts.strategy)) {
        console.error(`Unknown strategy: ${opts.strategy}`);
        console.error('Use "cashclaw trade list-strategies" to see available options.');
        process.exit(1);
      }

      console.log(`\n⏳ Backtesting ${opts.strategy} over ${days} days with $${capital}...\n`);

      const runner = new BacktestRunner();
      try {
        const result = await runner.run({
          strategy: opts.strategy,
          paperTrading: true,
          capitalUsdc: capital,
          days,
        });

        const m = result.metrics;

        if (opts.format === 'json') {
          console.log(JSON.stringify({ strategy: result.strategy, metrics: m, tradeCount: result.trades.length, durationMs: result.durationMs, warnings: result.warnings }, null, 2));
        } else {
          console.log('┌─────────────────────────────────────────────────┐');
          console.log(`│  Strategy: ${result.strategy.padEnd(37)} │`);
          console.log(`│  Period: ${String(days).padEnd(3)} days | Capital: $${capital.toFixed(0).padEnd(25)} │`);
          console.log('├─────────────────────────────────────────────────┤');
          console.log(`│  Sharpe:       ${String(m.sharpeRatio).padEnd(8)}  |  Max DD:   ${(m.maxDrawdown * 100).toFixed(1)}%`.padEnd(51) + '│');
          console.log(`│  Win Rate:     ${(m.winRate * 100).toFixed(1)}%`.padEnd(25) + `  |  Profit Factor: ${m.profitFactor === Infinity ? '∞' : String(m.profitFactor)}`.padEnd(28) + '│');
          console.log(`│  Total P&L:    $${String(m.totalPnl).padEnd(8)}  |  Avg/Trade: $${String(m.avgPnlPerTrade).padEnd(8)} │`);
          console.log('├─────────────────────────────────────────────────┤');
          console.log(`│  Trades: ${String(m.totalTrades).padEnd(5)} (${m.winningTrades}W / ${m.losingTrades}L)`.padEnd(35) + `  |  Best: $${String(m.bestTrade).padEnd(8)} │`);
          console.log(`│  Worst: $${String(m.worstTrade).padEnd(8)}  |  Duration: ${(result.durationMs / 1000).toFixed(1)}s`.padEnd(33) + '│');
          console.log('└─────────────────────────────────────────────────┘');
          if (result.warnings.length > 0) {
            console.log(`\n⚠ Warnings: ${result.warnings.join(', ')}`);
          }
        }

        runner.clearCache();
      } catch (err) {
        console.error(`Backtest failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
      console.log('');
    });
}
