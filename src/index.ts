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
import { runArbAuto } from './desk/commands/arb-auto';
import { wrapCliAction } from './desk/cli/cli-diagnostics';
import { logger } from './shared/utils/logger';


// Initialize Sentry before anything else
initSentry();

// Initialize OTel tracing (noop if OTEL_EXPORTER_OTLP_ENDPOINT unset).
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
  runMigrations().catch((err) => {
    logger.warn('[Startup] Migration runner skipped (DB may not be configured):', { err });
  });
}

export function buildCliProgram(): Command {
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
    .action(async (key?: string) => {
      const { runActivateCommand } = await import('./commands/activate-license');
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
    .action(async (options: { symbol: string; dryRun: boolean; capital: string; gamma: string; sigma: string; quoteSize: string; duration: string }) => {
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
    .command('amm:auto')
    .description('Prediction Market AMM Liquidity Engine & Combinatorial Arbitrage')
    .option('-m, --market <marketId>', 'Prediction market identifier', 'polymarket-election-2026')
    .option('--dry-run', 'Dry run mode (no live trades)', true)
    .option('--no-dry-run', 'Live trading mode')
    .option('-c, --capital <number>', 'Portfolio capital in USD', '100000')
    .option('-b, --liquidity-b <number>', 'LMSR liquidity parameter b', '1000')
    .option('-f, --fee-bps <number>', 'Pool fee in basis points', '20')
    .option('-d, --duration <seconds>', 'Execution duration in seconds (0 = single pass)', '0')
    .action(async (options: { market: string; dryRun: boolean; capital: string; liquidityB: string; feeBps: string; duration: string }) => {
      const { runAmmAuto } = await import('./desk/commands/amm-auto');
      await runAmmAuto({
        marketId: options.market,
        dryRun: options.dryRun,
        capital: parseFloat(options.capital),
        b: parseFloat(options.liquidityB),
        feeBps: parseFloat(options.feeBps),
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

  program
    .command('desk:auto')
    .description('Multi-Engine Autonomous Desk Runner & Live Execution Daemon')
    .option('-m, --mode <mode>', 'Trading mode: PAPER | SHADOW | LIVE', 'PAPER')
    .option('-c, --capital <number>', 'Portfolio capital in USD', '100000')
    .option('--dry-run', 'Dry run mode (no real trades)', true)
    .option('--no-dry-run', 'Live trading mode (real capital at risk)')
    .option('-e, --exchanges <list>', 'Venues to trade (comma-separated)', 'binance,bybit,polymarket')
    .option('-s, --symbols <list>', 'Trading pairs (comma-separated)', 'BTC/USDT,ETH/USDT')
    .option('-p, --poll-interval <ms>', 'Main tick poll interval in milliseconds', '1000')
    .option('--metrics-port <number>', 'Prometheus metrics and HTTP status port', '9100')
    .option('-d, --duration <seconds>', 'Execution duration in seconds (0 = indefinite)', '0')
    .action(wrapCliAction(async (options: Record<string, unknown>) => {
      const { runDeskAuto } = await import('./desk/commands/desk-auto');
      await runDeskAuto(options);
    }));

  program
    .command('desk:status')
    .description('Inspect real-time autonomous desk execution status and telemetry')
    .option('-p, --port <number>', 'Metrics & status server port', '9100')
    .option('--json', 'Output raw JSON status', false)
    .action(wrapCliAction(async (options: { port?: string; json?: boolean }) => {
      const { runDeskStatus } = await import('./desk/commands/desk-status');
      await runDeskStatus({
        port: options.port ? parseInt(options.port, 10) : undefined,
        json: options.json,
      });
    }));

  return program;
}

const isTest = process.env.NODE_ENV === 'test' || process.argv.includes('vitest');

if (!isTest) {
  const program = buildCliProgram();
  program.parse(process.argv);
  if (!process.argv.slice(2).length) {
    main();
    program.help();
  }
}
