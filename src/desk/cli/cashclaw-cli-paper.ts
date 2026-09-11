/**
 * CashClaw CLI Paper Trading, Status, and Backtesting Commands
 */

import { Command } from 'commander';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import { readJson } from '../../shared/persistence/persistent-store';
import type { BacktestTrade } from '../../shared/backtesting/backtest-runner';

interface Portfolio {
  capital: number;
  totalPnl: number;
  positions: unknown[];
  closedTrades: unknown[];
  winCount: number;
  lossCount: number;
}

interface PaperPortfolio {
  capital: number;
  totalPnl: number;
  closedTrades: BacktestTrade[];
}

export function registerPaperAndBacktestCommands(program: Command): void {
  program
    .command('paper')
    .description('Start paper trading (risk-free simulation)')
    .option('--capital <amount>', 'Starting capital in USDC', '200')
    .option('--interval <ms>', 'Scan interval in milliseconds', '30000')
    .option('--max-positions <n>', 'Max open positions at once', '10')
    .action(async (opts: { capital: string; interval: string; maxPositions: string }) => {
      const capitalUsdc = parseFloat(opts.capital);
      const intervalMs = parseInt(opts.interval, 10);
      const maxPositions = parseInt(opts.maxPositions, 10);

      if (isNaN(capitalUsdc) || capitalUsdc <= 0) {
        logger.error('Error: --capital must be a positive number');
        process.exit(1);
      }
      if (isNaN(intervalMs) || intervalMs < 5000) {
        logger.error('Error: --interval must be >= 5000ms');
        process.exit(1);
      }

      logger.info('CashClaw Paper Trading');
      logger.info(`Capital: $${capitalUsdc} | Interval: ${intervalMs}ms | Max positions: ${maxPositions}`);
      logger.info('Starting... (Ctrl+C to stop)\n');

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startPaperTrading } = require('../wiring/paper-trading-orchestrator') as {
        startPaperTrading: (cfg: { capitalUsdc: number; intervalMs: number; maxPositions: number }) => Promise<void>;
      };

      await startPaperTrading({ capitalUsdc, intervalMs, maxPositions });
    });

  program
    .command('status')
    .description('Show current paper trading P&L and positions')
    .action(() => {
      const file = path.join(process.cwd(), 'data', 'paper-trades.json');

      try {
        const d = readJson<Portfolio>(file);
        if (!d) {
          logger.info('No trades yet. Run: cashclaw paper');
          return;
        }
        const total = d.winCount + d.lossCount;
        const winRate = total > 0 ? ((d.winCount / total) * 100).toFixed(1) : '0.0';

        logger.info('CashClaw Status');
        logger.info('─'.repeat(40));
        logger.info(`Capital   : $${d.capital.toFixed(2)}`);
        logger.info(`Total P&L : $${d.totalPnl.toFixed(2)}`);
        logger.info(`Open      : ${d.positions.length} position(s)`);
        logger.info(`Closed    : ${d.closedTrades.length} trade(s)`);
        logger.info(`Wins      : ${d.winCount} | Losses: ${d.lossCount} | Win Rate: ${winRate}%`);
      } catch (err) {
        logger.error('Error reading trades file:', (err as Error).message);
        process.exit(1);
      }
    });

  program
    .command('backtest')
    .description('Run backtest on paper trading history')
    .option('--file <path>', 'Path to trade history JSON file', 'data/paper-trades.json')
    .option('--capital <amount>', 'Initial capital in USDC', '1000')
    .option('--format <format>', 'Output format: table|json', 'table')
    .action(async (opts: { file: string; capital: string; format: string }) => {
      const capital = parseFloat(opts.capital);
      if (isNaN(capital) || capital <= 0) {
        logger.error('Error: --capital must be a positive number');
        process.exit(1);
      }

      const filePath = path.resolve(process.cwd(), opts.file);

      try {
        const data = readJson<PaperPortfolio>(filePath);
        if (!data) {
          logger.error(`Error: Trade history file not found or invalid: ${filePath}`);
          logger.error('Run paper trading first: cashclaw paper');
          process.exit(1);
        }
        const trades = data.closedTrades ?? [];

        if (trades.length === 0) {
          logger.info('No closed trades in file. Keep trading to build history.');
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { BacktestRunner } = require('../../shared/backtesting/backtest-runner') as {
          BacktestRunner: { run: (trades: BacktestTrade[], config: Record<string, number>) => Record<string, unknown> };
        };

        const result = BacktestRunner.run(trades, {
          initialCapitalUsd: capital,
          riskFreeRateAnnual: 0.05,
        });

        if (opts.format === 'json') {
          logger.info(JSON.stringify(result, null, 2));
          return;
        }

        const ddPct = (Number(result.maxDrawdown) * 100).toFixed(1);
        const winPct = (Number(result.winRate) * 100).toFixed(0);
        const pnlSign = Number(result.totalPnlUsd) >= 0 ? '+' : '';
        const tradesStr = `${result.totalTrades} (${result.winningTrades}W / ${result.losingTrades}L)`;

        const best = Math.max(...trades.map((t) => t.pnlUsd));
        const worst = Math.min(...trades.map((t) => t.pnlUsd));

        logger.info('');
        logger.info(`Strategy: paper-trading  │ Capital: $${capital}`);
        logger.info(`Sharpe: ${Number(result.sharpeRatio).toFixed(2)}  │ Max Drawdown: ${ddPct}%  │ Win Rate: ${winPct}%`);
        logger.info(`Total P&L: ${pnlSign}$${Number(result.totalPnlUsd).toFixed(2)}  │ Profit Factor: ${Number(result.profitFactor).toFixed(2)}`);
        logger.info(`Trades: ${tradesStr}  │ Best: +$${best.toFixed(2)}  │ Worst: -$${Math.abs(worst).toFixed(2)}`);
        logger.info('');
      } catch (err) {
        logger.error('Backtest failed:', (err as Error).message);
        process.exit(1);
      }
    });
}
