import { Command } from 'commander';
import { KronosStrategy } from '../desk/strategies/kronos-strategy';
import { wrapCliAction } from '../desk/cli/cli-diagnostics';
import { logger } from '../shared/utils/logger';

export function registerDeskCommands(program: Command): void {
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
    .action(wrapCliAction(async (options: { symbol: string; dryRun: boolean; capital: string; gamma: string; sigma: string; quoteSize: string; duration: string }) => {
      const { runMarlAuto } = await import('../desk/commands/marl-auto');
      await runMarlAuto({
        symbol: options.symbol,
        dryRun: options.dryRun,
        capital: parseFloat(options.capital),
        gamma: parseFloat(options.gamma),
        sigma: parseFloat(options.sigma),
        quoteSize: parseFloat(options.quoteSize),
        durationSeconds: parseInt(options.duration, 10),
      });
    }));

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
    .action(wrapCliAction(async (options: { market: string; dryRun: boolean; capital: string; liquidityB: string; feeBps: string; duration: string }) => {
      const { runAmmAuto } = await import('../desk/commands/amm-auto');
      await runAmmAuto({
        marketId: options.market,
        dryRun: options.dryRun,
        capital: parseFloat(options.capital),
        b: parseFloat(options.liquidityB),
        feeBps: parseFloat(options.feeBps),
        durationSeconds: parseInt(options.duration, 10),
      });
    }));

  program
    .command('kronos')
    .description('Run Kronos Foundation Model trading strategy (requires AlphaEar sidecar)')
    .option('-s, --symbol <symbol>', 'Trading pair', 'BTC/USDT')
    .option('-t, --threshold <number>', 'Confidence threshold (0-1)', '0.6')
    .option('-l, --lookback <number>', 'Lookback candles', '60')
    .action(wrapCliAction(async (options: { symbol: string; threshold: string; lookback: string }) => {
      const strategy = new KronosStrategy({
        confidenceThreshold: parseFloat(options.threshold),
        lookback: parseInt(options.lookback),
      });
      logger.info(`[Kronos] Starting ${strategy.getName()} — symbol: ${options.symbol}`);
      await strategy.initialize();
      const status = strategy.getStatus();
      logger.info('[Kronos] Strategy ready', status);
    }));

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
      const { runDeskAuto } = await import('../desk/commands/desk-auto');
      await runDeskAuto(options);
    }));

  program
    .command('desk:status')
    .description('Inspect real-time autonomous desk execution status and telemetry')
    .option('-p, --port <number>', 'Metrics & status server port', '9100')
    .option('--json', 'Output raw JSON status', false)
    .action(wrapCliAction(async (options: { port?: string; json?: boolean }) => {
      const { runDeskStatus } = await import('../desk/commands/desk-status');
      await runDeskStatus({
        port: options.port ? parseInt(options.port, 10) : undefined,
        json: options.json,
      });
    }));

  program
    .command('idea:25')
    .alias('opencore-saas')
    .description('25-Step Open-Core Public GitHub & SaaS Monetization Blueprint (--deep)')
    .option('--steps', 'List all 25 steps across 5 phases', true)
    .option('--no-steps', 'Do not list all steps')
    .option('--audit', 'Run deterministic readiness & secret leak audit')
    .option('--funnel', 'Simulate PLG ARR economic flywheel')
    .option('--step <number>', 'Inspect a specific step (1-25)')
    .action(wrapCliAction(async (options: { steps?: boolean; audit?: boolean; funnel?: boolean; step?: string }) => {
      const { runOpenCoreSaasCommand } = await import('../desk/commands/opencore-saas');
      await runOpenCoreSaasCommand({
        steps: options.steps,
        audit: options.audit,
        funnel: options.funnel,
        stepNumber: options.step ? parseInt(options.step, 10) : undefined,
      });
    }));
}
