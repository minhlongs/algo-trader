/**
 * CashClaw Trade Run Handler — Executes V2 strategies via live/paper trading pipeline.
 *
 * Supports both single-strategy and multi-strategy (comma-separated or "all") modes.
 * Extracted from cashclaw-trade-commands.ts to keep files under 200 lines.
 */
import * as readline from 'readline';
import { logger } from '../../shared/utils/logger';

const REQUIRED_VARS: Array<{ newName: string; oldName: string }> = [
  { newName: 'POLYMARKET_API_KEY', oldName: 'POLY_API_KEY' },
  { newName: 'POLYMARKET_API_SECRET', oldName: 'POLY_API_SECRET' },
  { newName: 'POLYMARKET_PASSPHRASE', oldName: 'POLY_PASSPHRASE' },
  { newName: 'POLYMARKET_PRIVATE_KEY', oldName: 'POLY_PRIVATE_KEY' },
];

function validateLiveEnv(): void {
  const missing = REQUIRED_VARS.filter(({ newName, oldName }) => !process.env[newName] && !process.env[oldName]);
  if (missing.length > 0) {
    const names = missing.map(({ newName, oldName }) => `${newName} (or ${oldName})`);
    logger.error(`Cannot start LIVE trading. Missing env vars: ${names.join(', ')}`);
    process.exit(1);
  }
}

async function confirmLive(opts: { strategyNames: string[]; capitalUsdc: number; maxTicks: number; yes: boolean }): Promise<void> {
  if (opts.yes) return;
  logger.info('⚠️  LIVE TRADING: This will use REAL USDC on Polymarket.');
  logger.info(`   Strategies: ${opts.strategyNames.join(', ')} | Capital: $${opts.capitalUsdc} | Ticks: ${opts.maxTicks > 0 ? opts.maxTicks : 'unlimited'}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question('\nConfirm? (y/N): ', resolve));
  rl.close();
  if (!answer.toLowerCase().startsWith('y')) {
    logger.info('Aborted.');
    process.exit(0);
  }
}

async function runSingleStrategy(opts: {
  strategyName: string; isLive: boolean; capitalUsdc: number;
  tickIntervalMs: number; maxTicks: number;
}): Promise<void> {
  const { getStrategy } = await import('../polymarket/strategy-registry');
  const entry = getStrategy(opts.strategyName)!;
  const { StrategyRunner: Runner } = await import('../polymarket/strategy-runner');
  const runner = new Runner(entry.ctor, {
    strategyConfig: entry.defaultConfig,
    tradingConfig: { paperTrading: !opts.isLive, capitalUsdc: opts.capitalUsdc },
    tickIntervalMs: opts.tickIntervalMs,
    maxTicks: opts.maxTicks > 0 ? opts.maxTicks : 0,
    autoScan: false,
  });

  const shutdown = async () => {
    logger.info('\nShutting down...');
    await runner.stop();
    const status = runner.getStatus();
    logger.info(`\nFinal: ${status.tickCount} ticks, ${status.proxyStats.ordersPlaced} orders`);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runner.start();
  logger.info(`Runner active. Ticks every ${(opts.tickIntervalMs / 1000).toFixed(0)}s.\n`);

  const statusInterval = setInterval(() => {
    if (runner.getStatus().status !== 'running') { clearInterval(statusInterval); return; }
    const s = runner.getStatus();
    const summary = (runner as any).getPositionSummary?.() ?? { total: 0, open: 0, closed: 0 };
    logger.info(
      `[${new Date().toISOString().slice(11, 19)}] ` +
      `Tick#${s.tickCount} | Orders: ${s.proxyStats.ordersPlaced} | ` +
      `Positions: ${summary.positionCount} | Exposure: $${summary.totalExposure.toFixed(2)} | ` +
      `PnL: $${summary.totalRealizedPnl.toFixed(2)}`,
    );
  }, opts.tickIntervalMs);

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (runner.getStatus().status === 'stopped') { clearInterval(check); clearInterval(statusInterval); resolve(); }
    }, 1000);
  });
}

async function runMultiStrategy(opts: {
  strategyNames: string[]; isLive: boolean; capitalUsdc: number;
  tickIntervalMs: number; maxTicks: number;
}): Promise<void> {
  const { MultiStrategyRunner } = await import('../polymarket/multi-strategy-runner');
  const multi = new MultiStrategyRunner({
    strategies: opts.strategyNames,
    tradingConfig: { paperTrading: !opts.isLive, capitalUsdc: opts.capitalUsdc },
    tickIntervalMs: opts.tickIntervalMs,
    maxTicks: opts.maxTicks > 0 ? opts.maxTicks : 0,
  });

  const shutdown = async () => {
    logger.info('\nShutting down...');
    await multi.stop();
    const status = multi.getStatus();
    logger.info(`\nFinal: ${status.summary.totalTicks} ticks, ${status.summary.totalOrders} orders across ${status.runnerCount} strategies`);
    for (const r of status.runners) {
      logger.info(`  ${r.strategy}: ${r.ticks}t / ${r.orders}o`);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await multi.start();
  logger.info(`${opts.strategyNames.length} strategies active. Ticks every ${(opts.tickIntervalMs / 1000).toFixed(0)}s.\n`);

  const statusInterval = setInterval(() => {
    if (multi.isDone() || multi.getStatus().status !== 'running') { clearInterval(statusInterval); return; }
    const s = multi.getStatus();
    const orch = multi.getOrchestrator();
    const summary = orch.getPositionSummary();
    logger.info(
      `[${new Date().toISOString().slice(11, 19)}] ` +
      `Ticks: ${s.summary.totalTicks} | Orders: ${s.summary.totalOrders} | ` +
      `Positions: ${summary.positionCount} | Exposure: $${summary.totalExposure.toFixed(2)} | ` +
      `PnL: $${summary.totalRealizedPnl.toFixed(2)}`,
    );
  }, opts.tickIntervalMs);

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (multi.isDone() || multi.getStatus().status !== 'running') { clearInterval(check); clearInterval(statusInterval); resolve(); }
    }, 1000);
  });

  await multi.waitForDone();
}

export async function handleTradeRun(opts: {
  strategy: string; mode: string; capital: string;
  ticks: string; interval: string; yes: boolean;
}): Promise<void> {
  const capitalUsdc = parseFloat(opts.capital);
  const maxTicks = parseInt(opts.ticks, 10);
  const tickIntervalMs = parseInt(opts.interval, 10);

  if (isNaN(capitalUsdc) || capitalUsdc <= 0) {
    logger.error('Error: --capital must be a positive number');
    process.exit(1);
  }

  const isLive = opts.mode === 'live';

  // Resolve strategy list
  const { getStrategy, listStrategies } = await import('../polymarket/strategy-registry');
  let strategyNames: string[];
  if (opts.strategy === 'all') {
    strategyNames = listStrategies().map((s) => s.name);
  } else if (opts.strategy.includes(',')) {
    strategyNames = opts.strategy.split(',').map((s) => s.trim());
  } else {
    strategyNames = [opts.strategy];
  }

  // Validate all exist
  const missing = strategyNames.filter((n) => !getStrategy(n));
  if (missing.length > 0) {
    logger.error(`Unknown strategies: ${missing.join(', ')}`);
    logger.error('Use "cashclaw trade list-strategies" to see available options.');
    process.exit(1);
  }

  const isMulti = strategyNames.length > 1;

  if (isLive) {
    validateLiveEnv();
    await confirmLive({ strategyNames, capitalUsdc, maxTicks, yes: opts.yes });
  }

  const modeLabel = isLive ? 'LIVE' : 'PAPER';
  logger.info(`\nCashClaw ${modeLabel} Strategy Runner`);
  logger.info(`Strategies: ${strategyNames.join(', ')} | Capital: $${capitalUsdc} | Ticks: ${maxTicks > 0 ? maxTicks : 'unlimited'} | Interval: ${tickIntervalMs}ms`);
  if (isMulti) logger.info(`Running ${strategyNames.length} strategies concurrently (shared guard + journal)`);
  logger.info('Starting... (Ctrl+C to stop)\n');

  if (!isMulti) {
    await runSingleStrategy({ strategyName: strategyNames[0], isLive, capitalUsdc, tickIntervalMs, maxTicks });
  } else {
    await runMultiStrategy({ strategyNames, isLive, capitalUsdc, tickIntervalMs, maxTicks });
  }

  logger.info('Done.\n');
}
