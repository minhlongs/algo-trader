/**
 * CashClaw Trade Runner Subroutines
 *
 * Single and multi-strategy execution loops with signal handling and status logging.
 *
 * @module desk/cli/cashclaw-trade-runner-subroutines
 */

import { logger } from '../../shared/utils/logger';
import { formatCurrencyPnl } from './cli-diagnostics';

export async function runSingleStrategy(opts: {
  strategyName: string;
  isLive: boolean;
  capitalUsdc: number;
  tickIntervalMs: number;
  maxTicks: number;
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
    const s = runner.getStatus();
    if (s.status !== 'running') {
      clearInterval(statusInterval);
      return;
    }
    type SummaryGetter = {
      getPositionSummary?: () => {
        positionCount: number;
        totalExposure: number;
        totalRealizedPnl: number;
      };
    };
    const summary = (runner as unknown as SummaryGetter).getPositionSummary?.() ?? {
      positionCount: 0,
      totalExposure: 0,
      totalRealizedPnl: 0,
    };
    logger.info(
      `[${new Date().toISOString().slice(11, 19)}] ` +
        `Tick#${s.tickCount} | Orders: ${s.proxyStats.ordersPlaced} | ` +
        `Positions: ${summary.positionCount} | Exposure: $${summary.totalExposure.toFixed(2)} | ` +
        `PnL: ${formatCurrencyPnl(summary.totalRealizedPnl)}`,
    );
  }, opts.tickIntervalMs);

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (runner.getStatus().status === 'stopped') {
        clearInterval(check);
        clearInterval(statusInterval);
        resolve();
      }
    }, 1000);
  });
}

export async function runMultiStrategy(opts: {
  strategyNames: string[];
  isLive: boolean;
  capitalUsdc: number;
  tickIntervalMs: number;
  maxTicks: number;
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
    logger.info(
      `\nFinal: ${status.summary.totalTicks} ticks, ${status.summary.totalOrders} orders across ${status.runnerCount} strategies`,
    );
    for (const r of status.runners) {
      logger.info(`  ${r.strategy}: ${r.ticks}t / ${r.orders}o`);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await multi.start();
  logger.info(
    `${opts.strategyNames.length} strategies active. Ticks every ${(opts.tickIntervalMs / 1000).toFixed(0)}s.\n`,
  );

  const statusInterval = setInterval(() => {
    if (multi.isDone() || multi.getStatus().status !== 'running') {
      clearInterval(statusInterval);
      return;
    }
    const s = multi.getStatus();
    const orch = multi.getOrchestrator();
    const summary = orch.getPositionSummary();
    logger.info(
      `[${new Date().toISOString().slice(11, 19)}] ` +
        `Ticks: ${s.summary.totalTicks} | Orders: ${s.summary.totalOrders} | ` +
        `Positions: ${summary.positionCount} | Exposure: $${summary.totalExposure.toFixed(2)} | ` +
        `PnL: ${formatCurrencyPnl(summary.totalRealizedPnl)}`,
    );
  }, opts.tickIntervalMs);

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (multi.isDone() || multi.getStatus().status !== 'running') {
        clearInterval(check);
        clearInterval(statusInterval);
        resolve();
      }
    }, 1000);
  });

  await multi.waitForDone();
}
