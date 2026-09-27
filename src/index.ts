/**
 * Algo Trader - Main entry point
 * Algorithmic trading platform with zero-config onboarding
 */

import 'dotenv/config';
import { Command } from 'commander';
import { initSentry } from './utils/sentry-init';
import { initTracing } from './utils/tracing';
import { runMigrations } from './db/migration-runner';
import { KronosStrategy } from './desk/strategies/kronos-strategy';
import { runSetupWizard } from './commands/setup-wizard';
import { runQuickstart } from './commands/quickstart';
import { runActivateCommand } from './commands/activate-license';
import { runArbAuto } from './desk/commands/arb-auto';
import { logger } from './utils/logger';

// Initialize Sentry before anything else
initSentry();

// Initialize OTel tracing (noop if OTEL_EXPORTER_OTLP_ENDPOINT unset).
// Non-blocking at top-level — errors are logged inside.
initTracing().catch((err) => logger.warn('[Startup] initTracing failed', { err }));

export interface ArbAutoOptions {
  symbols: string;
  exchanges: string;
  minSpread: string;
  dryRun: boolean;
  verbose: boolean;
  strategy?: string;
  maxQueue?: string;
}

export const version = '1.0.0';

export function main(): void {
  logger.info(`Algo Trader v${version} started`);
  // Run migrations on startup (non-blocking if DB not configured)
  runMigrations().catch((err) => {
    logger.warn('[Startup] Migration runner skipped (DB may not be configured):', { err });
  });
}

// CLI setup - only run in non-test environment
const isTest = process.env.NODE_ENV === 'test' || process.argv.includes('vitest');

if (!isTest) {
  const program = new Command();

  program
    .name('algo-trader')
    .description('Algorithmic trading bot with ML strategies and zero-config onboarding')
    .version(version);

  program
    .command('setup')
    .description('Interactive setup wizard - configure API keys, risk preferences, trading mode')
    .action(async () => {
      await runSetupWizard();
    });

  program
    .command('quickstart')
    .description('Zero-config start - instant trading with defaults')
    .action(async () => {
      await runQuickstart();
    });

  program
    .command('activate [key]')
    .description('Activate beta invite license key')
    .action(async (key?: string) => {
      await runActivateCommand(key);
    });

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
    .action(async (options: ArbAutoOptions) => {
      await runArbAuto({
        symbols: options.symbols,
        exchanges: options.exchanges,
        minSpread: parseFloat(options.minSpread),
        dryRun: options.dryRun,
        verbose: options.verbose,
        strategy: options.strategy || 'all',
        maxQueueSize: parseInt(options.maxQueue || '50'),
      } as import('./desk/commands/arb-auto').AutoCommandOptions);
    });

  program
    .command('marl:auto')
    .description('Autonomous MARL Market-Making & Delta-Neutral Liquidity Engine')
    .option('-s, --symbol <symbol>', 'Trading pair or market identifier', 'BTC/USDT')
    .option('--dry-run', 'Dry run mode (no real orders)', true)
    .option('--no-dry-run', 'Live market-making mode')
    .option('-c, --capital <number>', 'Portfolio capital in USD', '100000')
    .option('-g, --gamma <number>', 'Risk aversion parameter', '0.1')
    .option('--sigma <number>', 'Asset volatility parameter', '0.3')
    .option('--quote-size <number>', 'Quote size per order', '10')
    .option('-d, --duration <seconds>', 'Execution duration in seconds (0 = single pass)', '0')
    .action(async (options: {
      symbol: string;
      dryRun: boolean;
      capital: string;
      gamma: string;
      sigma: string;
      quoteSize: string;
      duration: string;
    }) => {
      const { runMarlAuto } = await import('./desk/commands/marl-auto');
      await runMarlAuto({
        symbol: options.symbol,
        dryRun: options.dryRun,
        capital: parseFloat(options.capital),
        gamma: parseFloat(options.gamma),
        sigma: parseFloat(options.sigma),
        quoteSize: parseFloat(options.quoteSize),
        durationSeconds: parseInt(options.duration, 10),
      });
    });

  program
    .command('kronos')
    .description('Run Kronos Foundation Model trading strategy (requires AlphaEar sidecar)')
    .option('-s, --symbol <symbol>', 'Trading pair', 'BTC/USDT')
    .option('-t, --threshold <number>', 'Confidence threshold (0-1)', '0.6')
    .option('-l, --lookback <number>', 'Lookback candles', '60')
    .action(async (options: { symbol: string; threshold: string; lookback: string }) => {
      const strategy = new KronosStrategy({
        confidenceThreshold: parseFloat(options.threshold),
        lookback: parseInt(options.lookback),
      });
      logger.info(`[Kronos] Starting ${strategy.getName()} — symbol: ${options.symbol}`);
      await strategy.initialize();
      const status = strategy.getStatus();
      logger.info('[Kronos] Strategy ready', status);
    });

  program.parse(process.argv);

  // Run main if no command specified
  if (!process.argv.slice(2).length) {
    main();
    program.help();
  }
}
