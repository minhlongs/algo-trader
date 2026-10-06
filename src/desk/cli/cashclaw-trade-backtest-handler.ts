/**
 * CashClaw Trade Backtest Handler — CLI handler for running backtests against Gamma historical data.
 */
import { logger } from '../../shared/utils/logger';
import { formatCurrencyPnl } from './cli-diagnostics';

export async function handleTradeBacktest(opts: {
  strategy: string;
  days: string;
  capital: string;
  format: string;
}): Promise<void> {
  const days = parseInt(opts.days, 10);
  const capital = parseFloat(opts.capital);
  const { BacktestRunner } = await import('../backtesting/backtest-runner');
  const { listStrategies } = await import('../polymarket/strategy-registry');

  const available = listStrategies().map((s) => s.name);
  if (!available.includes(opts.strategy)) {
    logger.error(`Unknown strategy: ${opts.strategy}`);
    logger.error('Use "cashclaw trade list-strategies" to see available options.');
    process.exit(1);
  }

  logger.info(`\n⏳ Backtesting ${opts.strategy} over ${days} days with $${capital}...\n`);

  const runner = new BacktestRunner();
  try {
    const result = await runner.run({
      strategy: opts.strategy,
      paperTrading: true,
      capitalUsdc: capital,
      days,
    });

    const m = result.metrics;

    if (opts.format === 'json') {
      logger.info(
        JSON.stringify(
          {
            strategy: result.strategy,
            metrics: m,
            tradeCount: result.trades.length,
            durationMs: result.durationMs,
            warnings: result.warnings,
          },
          null,
          2,
        ),
      );
    } else {
      const boxWidth = 49;
      const padRow = (text: string) => `│ ${text.padEnd(boxWidth - 2)} │`;
      logger.info(`┌${'─'.repeat(boxWidth)}┐`);
      logger.info(padRow(`Strategy: ${result.strategy}`));
      logger.info(padRow(`Period: ${days} days | Capital: $${capital.toFixed(0)}`));
      logger.info(`├${'─'.repeat(boxWidth)}┤`);
      logger.info(padRow(`Sharpe: ${String(m.sharpeRatio)} | Max DD: ${(m.maxDrawdown * 100).toFixed(1)}%`));
      logger.info(padRow(`Win Rate: ${(m.winRate * 100).toFixed(1)}% | Profit Factor: ${m.profitFactor === Infinity ? '∞' : String(m.profitFactor)}`));
      logger.info(padRow(`Total P&L: ${formatCurrencyPnl(m.totalPnl)} | Avg/Trade: ${formatCurrencyPnl(m.avgPnlPerTrade)}`));
      logger.info(`├${'─'.repeat(boxWidth)}┤`);
      logger.info(padRow(`Trades: ${String(m.totalTrades)} (${m.winningTrades}W / ${m.losingTrades}L) | Best: ${formatCurrencyPnl(m.bestTrade)}`));
      logger.info(padRow(`Worst: ${formatCurrencyPnl(m.worstTrade)} | Duration: ${(result.durationMs / 1000).toFixed(1)}s`));
      logger.info(`└${'─'.repeat(boxWidth)}┘`);
      if (result.warnings.length > 0) {
        logger.info(`\n⚠ Warnings: ${result.warnings.join(', ')}`);
      }
    }

    runner.clearCache();
  } catch (err) {
    logger.error(`Backtest failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  logger.info('');
}
