/**
 * CashClaw Trade Commands — CLI handlers for live/paper trading.
 *
 * Subcommands of `cashclaw trade`:
 *   start, status, list-strategies, run, demo, journal, backtest
 */
import type { Command } from 'commander';
import { handleTradeRun } from './cashclaw-trade-run-handler';
import { handleTradeStart } from './cashclaw-trade-start-handler';
import { handleDemoTrade } from './demo-trade-handler';
import { handleTradeJournal } from './cashclaw-trade-journal-handler';
import { handleTradeBacktest } from './cashclaw-trade-backtest-handler';
import { logger } from '../../shared/utils/logger';

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
        logger.info(
          JSON.stringify({
            mode: 'live',
            paperMode: process.env['PAPER_MODE'] ?? 'true',
            note: 'Status available when orchestrator is running. Use "trade start" first.',
            timestamp: new Date().toISOString(),
          }),
        );
        return;
      }

      const paperMode = process.env['PAPER_MODE'] ?? 'true';
      logger.info('CashClaw Live Trading Status');
      logger.info('─'.repeat(40));
      logger.info(`PAPER_MODE: ${paperMode === 'false' ? 'LIVE' : 'PAPER'}`);
      logger.info('No live orchestrator running.');
      logger.info('Start with: cashclaw trade start --mode=live --capital=1000');
      logger.info('');
      logger.info('Required env vars for LIVE mode:');
      const req: Array<{ newName: string; oldName: string; label: string }> = [
        { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY', label: 'API Key' },
        { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET', label: 'API Secret' },
        { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE', label: 'Passphrase' },
        { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY', label: 'Private Key' },
      ];
      for (const v of req) {
        const set = !!(process.env[v.newName] || process.env[v.oldName]);
        logger.info(`  ${v.label}: ${set ? '✓ set' : '✗ missing'}`);
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
      logger.info('\nAvailable strategies for "algo trade run":\n');
      for (const s of strategies) {
        logger.info(`  ${s.name}`);
        logger.info(`    ${s.description}`);
      }
      logger.info(`\n${strategies.length} strategies registered.`);
      logger.info('Use: cashclaw trade run --strategy=<name>\n');
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

  // ── trade demo ───────────────────────────────────────────────────────────────

  tradeCmd
    .command('demo')
    .description('Run a single demo trade through risk gate and execution engine')
    .option('--strategy <name>', 'Strategy to resolve', 'spread-mean-reversion')
    .option('--capital <amount>', 'Paper capital in USDC', '1000')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (opts: { strategy: string; capital: string; yes: boolean }) => {
      await handleDemoTrade(opts);
    });

  // ── trade journal ────────────────────────────────────────────────────────────

  tradeCmd
    .command('journal')
    .description('View live trading journal: fills, events, daily P&L')
    .option('--type <type>', 'Filter: fills, events, pnl, or all', 'all')
    .option('--limit <n>', 'Number of entries to show', '20')
    .action((opts: { type: string; limit: string }) => {
      handleTradeJournal(opts);
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
      await handleTradeBacktest(opts);
    });
}
