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
import { registerScanCommands } from './cashclaw-cli-scan';
import { registerPaperAndBacktestCommands } from './cashclaw-cli-paper';
import { registerTradeCommands } from './cashclaw-trade-commands';
import { registerAlphaCommands } from './alpha-commands';

export function createCashclawProgram(): Command {
  const program = new Command()
    .name('cashclaw')
    .description('AI-powered Polymarket trading bot')
    .version('1.1.0');

  registerPaperAndBacktestCommands(program);
  registerScanCommands(program);

  const tradeCmd = program
    .command('trade')
    .description('Live/paper trading management');
  registerTradeCommands(tradeCmd);

  const alphaCmd = program
    .command('alpha')
    .description('Alpha Discovery Engine — discover, backtest, and evaluate trading strategies');
  registerAlphaCommands(alphaCmd);

  program
    .command('doctor')
    .description('Run environment health checks (execution mode, DB, ledger, gates, baseline)')
    .action(async () => {
      const { runDoctorCli } = await import('./system-doctor-defaults');
      await runDoctorCli();
    });

  return program;
}

if (require.main === module) {
  const program = createCashclawProgram();
  program.parse(process.argv);
}
