#!/usr/bin/env node
/**
 * CashClaw CLI — Polymarket trading bot.
 *
 * Usage:
 *   npx cashclaw paper                    — start paper trading ($200 default)
 *   npx cashclaw paper --capital 500      — start with $500
 *   npx cashclaw status                   — show current P&L + positions
 *   npx cashclaw scan                     — one-time market scan (no trading)
 *   npx cashclaw trade start --mode=live  — LIVE trading (real USDC, requires env vars)
 *   npx cashclaw trade start              — paper trading via trade command
 *   npx cashclaw trade status             — check live trading state
 *   npx cashclaw backtest                 — run backtest on paper trading history
 *   npx cashclaw backtest --format=json   — backtest results as JSON
 *   npx cashclaw doctor                   — environment health checks (5 checks)
 */

import { Command } from 'commander';
import * as path from 'path';
import { logger } from '../../shared/utils/logger';
import { readJson } from '../../shared/persistence/persistent-store';
import type { BacktestTrade } from '../../shared/backtesting/backtest-runner';

import { runNegRiskScan } from '../commands/neg-risk-scan';

const program = new Command()
  .name('cashclaw')
  .description('AI-powered Polymarket trading bot')
  .version('1.1.0');

// ─── paper command ────────────────────────────────────────────────────────────

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

    // Dynamic require — wiring is excluded from tsc but compiled separately
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { startPaperTrading } = require('../wiring/paper-trading-orchestrator') as {
      startPaperTrading: (cfg: { capitalUsdc: number; intervalMs: number; maxPositions: number }) => Promise<void>;
    };

    await startPaperTrading({ capitalUsdc, intervalMs, maxPositions });
  });

// ─── status command ───────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show current paper trading P&L and positions')
  .action(() => {
    const file = path.join(process.cwd(), 'data', 'paper-trades.json');

    try {
      interface Portfolio {
        capital: number;
        totalPnl: number;
        positions: unknown[];
        closedTrades: unknown[];
        winCount: number;
        lossCount: number;
      }
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

// ─── scan command ─────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('One-time market scan — show opportunities without trading')
  .action(async () => {
    logger.info('Scanning Polymarket...\n');

    try {
      const resp = await fetch(
        'https://gamma-api.polymarket.com/markets?closed=false&limit=200',
        { signal: AbortSignal.timeout(15_000) }
      );

      if (!resp.ok) {
        logger.error(`Gamma API error: HTTP ${resp.status}`);
        process.exit(1);
      }

      const markets = (await resp.json()) as Array<Record<string, unknown>>;
      let endgameCount = 0;

      for (const m of markets) {
        try {
          const prices = JSON.parse((m['outcomePrices'] as string) ?? '[]') as string[];
          const yes = parseFloat(prices[0] ?? '0');
          const vol = Number(m['volume'] ?? 0);

          if ((yes > 0.95 || yes < 0.05) && vol > 10_000) {
            endgameCount++;
            const edge = yes > 0.95
              ? ((1 - yes - 0.02) * 100).toFixed(1)
              : ((yes - 0.02) * 100).toFixed(1);
            const side = yes > 0.95 ? 'YES' : 'NO';
            const question = String(m['question'] ?? '').substring(0, 60);

            if (endgameCount <= 10) {
              logger.info(`  [${side}] @${yes.toFixed(3)} edge: ${edge}%  ${question}`);
            }
          }
        } catch { /* skip malformed entry */ }
      }

      logger.info(`\nFound ${endgameCount} endgame opportunities in ${markets.length} markets`);
    } catch (err) {
      logger.error('Scan failed:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── neg-risk-scan command ─────────────────────────────────────────────────────

program
  .command('neg-risk-scan')
  .description('Scan for negative risk arbitrage opportunities (YES+NO sum < threshold)')
  .option('--threshold <t>', 'Sum threshold (e.g., 0.98)', '0.98')
  .option('--minVolume <v>', 'Minimum market volume (USDC)', '1000')
  .option('--maxSize <s>', 'Max opportunity size per leg (USDC)', '10')
  .action(async (opts) => {
    await runNegRiskScan({
      threshold: parseFloat(opts.threshold),
      minVolumeUsdc: parseFloat(opts.minVolume),
      maxOpportunitySizeUsdc: parseFloat(opts.maxSize),
    });
  });

program
  .command('ledger <wallet>')
  .description('Show REAL Polymarket trades for any wallet (public data)')
  .option('--limit <n>', 'Number of trades', '50')
  .action(async (wallet: string, _opts: { limit: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { showRealLedger } = require('../polymarket');
    await showRealLedger(wallet);
  });

// ─── backtest command ─────────────────────────────────────────────────────────

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
      interface PaperPortfolio {
        capital: number;
        totalPnl: number;
        closedTrades: BacktestTrade[];
      }

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

      // Dynamic import — shared backtesting engine
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

      // ── Table output ──────────────────────────────────────────────────
      const ddPct = (Number(result.maxDrawdown) * 100).toFixed(1);
      const winPct = (Number(result.winRate) * 100).toFixed(0);
      const pnlSign = Number(result.totalPnlUsd) >= 0 ? '+' : '';
      const tradesStr = `${result.totalTrades} (${result.winningTrades}W / ${result.losingTrades}L)`;

      // Best/worst from raw trades
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

// ─── trade commands ──────────────────────────────────────────────────────────────

import { registerTradeCommands } from './cashclaw-trade-commands';
const tradeCmd = program
  .command('trade')
  .description('Live/paper trading management');
registerTradeCommands(tradeCmd);

// ─── alpha commands ─────────────────────────────────────────────────────────────

import { registerAlphaCommands } from './alpha-commands';
const alphaCmd = program
  .command('alpha')
  .description('Alpha Discovery Engine — discover, backtest, and evaluate trading strategies');
registerAlphaCommands(alphaCmd);

// ─── doctor command ──────────────────────────────────────────────────────────

program
  .command('doctor')
  .description('Run environment health checks (execution mode, DB, ledger, gates, baseline)')
  .action(async () => {
    const { runDoctorCli } = await import('./system-doctor-defaults');
    await runDoctorCli();
  });

// ─── parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv);
