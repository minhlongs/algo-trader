#!/usr/bin/env node
/**
 * CashClaw CLI — simple entry point for Polymarket paper trading.
 *
 * Usage:
 *   npx cashclaw paper              — start paper trading ($200 default)
 *   npx cashclaw paper --capital 500  — start with $500
 *   npx cashclaw status             — show current P&L + positions
 *   npx cashclaw scan               — one-time market scan (no trading)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

import { runNegRiskScan } from '../commands/neg-risk-scan.js';

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
      console.error('Error: --capital must be a positive number');
      process.exit(1);
    }
    if (isNaN(intervalMs) || intervalMs < 5000) {
      console.error('Error: --interval must be >= 5000ms');
      process.exit(1);
    }

    console.log('CashClaw Paper Trading');
    console.log(`Capital: $${capitalUsdc} | Interval: ${intervalMs}ms | Max positions: ${maxPositions}`);
    console.log('Starting... (Ctrl+C to stop)\n');

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
    if (!fs.existsSync(file)) {
      console.log('No trades yet. Run: cashclaw paper');
      return;
    }

    try {
      interface Portfolio {
        capital: number;
        totalPnl: number;
        positions: unknown[];
        closedTrades: unknown[];
        winCount: number;
        lossCount: number;
      }
      const d = JSON.parse(fs.readFileSync(file, 'utf-8')) as Portfolio;
      const total = d.winCount + d.lossCount;
      const winRate = total > 0 ? ((d.winCount / total) * 100).toFixed(1) : '0.0';

      console.log('CashClaw Status');
      console.log('─'.repeat(40));
      console.log(`Capital   : $${d.capital.toFixed(2)}`);
      console.log(`Total P&L : $${d.totalPnl.toFixed(2)}`);
      console.log(`Open      : ${d.positions.length} position(s)`);
      console.log(`Closed    : ${d.closedTrades.length} trade(s)`);
      console.log(`Wins      : ${d.winCount} | Losses: ${d.lossCount} | Win Rate: ${winRate}%`);
    } catch (err) {
      console.error('Error reading trades file:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── scan command ─────────────────────────────────────────────────────────────

program
  .command('scan')
  .description('One-time market scan — show opportunities without trading')
  .action(async () => {
    console.log('Scanning Polymarket...\n');

    try {
      const resp = await fetch(
        'https://gamma-api.polymarket.com/markets?closed=false&limit=200',
        { signal: AbortSignal.timeout(15_000) }
      );

      if (!resp.ok) {
        console.error(`Gamma API error: HTTP ${resp.status}`);
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
              console.log(`  [${side}] @${yes.toFixed(3)} edge: ${edge}%  ${question}`);
            }
          }
        } catch { /* skip malformed entry */ }
      }

      console.log(`\nFound ${endgameCount} endgame opportunities in ${markets.length} markets`);
    } catch (err) {
      console.error('Scan failed:', (err as Error).message);
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
    const { showRealLedger } = require('../polymarket/real-trade-ledger');
    await showRealLedger(wallet);
  });

// ─── parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv);
