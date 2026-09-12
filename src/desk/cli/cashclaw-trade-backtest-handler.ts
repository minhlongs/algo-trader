/**
 * CashClaw Trade Backtest Handler — CLI handler for running backtests against Gamma historical data.
 */
import { logger } from '../../shared/utils/logger';

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
      logger.info('┌─────────────────────────────────────────────────┐');
      logger.info(`│  Strategy: ${result.strategy.padEnd(37)} │`);
      logger.info(`│  Period: ${String(days).padEnd(3)} days | Capital: $${capital.toFixed(0).padEnd(25)} │`);
      logger.info('├─────────────────────────────────────────────────┤');
      logger.info(`│  Sharpe:       ${String(m.sharpeRatio).padEnd(8)}  |  Max DD:   ${(m.maxDrawdown * 100).toFixed(1)}%`.padEnd(51) + '│');
      logger.info(`│  Win Rate:     ${(m.winRate * 100).toFixed(1)}%`.padEnd(25) + `  |  Profit Factor: ${m.profitFactor === Infinity ? '∞' : String(m.profitFactor)}`.padEnd(28) + '│');
      logger.info(`│  Total P&L:    $${String(m.totalPnl).padEnd(8)}  |  Avg/Trade: $${String(m.avgPnlPerTrade).padEnd(8)} │`);
      logger.info('├─────────────────────────────────────────────────┤');
      logger.info(`│  Trades: ${String(m.totalTrades).padEnd(5)} (${m.winningTrades}W / ${m.losingTrades}L)`.padEnd(35) + `  |  Best: $${String(m.bestTrade).padEnd(8)} │`);
      logger.info(`│  Worst: $${String(m.worstTrade).padEnd(8)}  |  Duration: ${(result.durationMs / 1000).toFixed(1)}s`.padEnd(33) + '│');
      logger.info('└─────────────────────────────────────────────────┘');
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
