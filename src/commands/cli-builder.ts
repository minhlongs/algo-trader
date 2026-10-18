import { Command } from 'commander';
import { runSetupWizard } from './setup-wizard';
import { runQuickstart } from './quickstart';
import { runArbAuto, type AutoCommandOptions } from '../desk/commands/arb-auto';
import { wrapCliAction } from '../desk/cli/cli-diagnostics';
import { registerDeskCommands } from './cli-desk-commands';

export interface ArbAutoOptions {
  symbols: string;
  exchanges: string;
  minSpread: string;
  dryRun: boolean;
  verbose: boolean;
  strategy?: string;
  maxQueue?: string;
}

export function buildCliProgram(version: string = '1.0.0'): Command {
  const program = new Command();
  program
    .name('algo-trader')
    .description('Algorithmic trading bot with ML strategies and zero-config onboarding')
    .version(version);

  program
    .command('setup')
    .description('Interactive setup wizard - configure API keys, risk preferences, trading mode')
    .action(wrapCliAction(async () => { await runSetupWizard(); }));

  program
    .command('quickstart')
    .description('Zero-config start - instant trading with defaults')
    .action(wrapCliAction(async () => { await runQuickstart(); }));

  program
    .command('activate [key]')
    .description('Activate beta invite license key')
    .action(wrapCliAction(async (key?: string) => {
      const { runActivateCommand } = await import('./activate-license');
      await runActivateCommand(key);
    }));

  program
    .command('arb:auto')
    .description('Unified arbitrage execution engine - cross-exchange, triangular, dex-cex, binary, split-merge, cross-market')
    .option('-s, --symbols <symbols>', 'Trading pairs (comma-separated)', 'BTC/USDT,ETH/USDT,SOL/USDT')
    .option('-e, --exchanges <exchanges>', 'Exchanges (comma-separated)', 'binance,okx,bybit')
    .option('--min-spread <percent>', 'Minimum spread percentage', '0.05')
    .option('--dry-run', 'Dry run mode (no real trades)', true)
    .option('--no-dry-run', 'Live trading mode (real trades)')
    .option('-v, --verbose', 'Verbose logging', true)
    .option('--strategy <type>', 'Strategy: cross-exchange|triangular|dex-cex|funding-rate|binary|split-merge|cross-market|all', 'all')
    .option('--max-queue <number>', 'Max queued opportunities', '50')
    .action(wrapCliAction(async (options: ArbAutoOptions) => {
      await runArbAuto({
        symbols: options.symbols,
        exchanges: options.exchanges,
        minSpread: parseFloat(options.minSpread),
        dryRun: options.dryRun,
        verbose: options.verbose,
        strategy: options.strategy || 'all',
        maxQueueSize: parseInt(options.maxQueue || '50'),
      } as AutoCommandOptions);
    }));

  registerDeskCommands(program);
  return program;
}
