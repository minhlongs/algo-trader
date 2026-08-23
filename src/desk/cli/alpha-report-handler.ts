/**
 * Alpha Report Handler — runs experiment and shows full evaluation report with breakdowns.
 */
import { logger } from '../../shared/utils/logger';
import { loadConfigByName, loadCandlesForConfig, writeOutput, printTable } from './alpha-helpers';
import { runExperiment } from '../../alpha-lab/experiments/experiment-engine';

export async function handleReport(
  experiment: string,
  opts: { json?: boolean; output?: string },
): Promise<void> {
  const config = loadConfigByName(experiment);
  const { candles, source } = await loadCandlesForConfig(config);
  const result = runExperiment({ candles, config });

  // Dynamic imports for evaluation pipeline (same modules run-experiment.ts uses)
  const { buildTrades } = await import('../../alpha-lab/shared/trade-builder');
  const { batchLabel } = await import('../../alpha-lab/labeling/triple-barrier');
  const { buildEquityCurve } = await import('../../alpha-lab/shared/equity-curve');
  const { classifyRegime, defaultRules } = await import('../../alpha-lab/regimes/regime-engine');
  const { evaluate } = await import('../../alpha-lab/evaluation/evaluation-engine');

  const closes = candles.map((c) => ({ high: c.high, low: c.low, close: c.close, timestamp: c.timestamp }));
  const labels = batchLabel(closes, config.tp, config.sl, config.maxHolding, config.lookback);
  const trades = buildTrades(candles, labels, { tp: config.tp, sl: config.sl, feeBps: config.cost.feeBps, slippageBps: config.cost.slippageBps });
  const _equity = buildEquityCurve(candles, trades);

  const rules = defaultRules();
  const regimesPerBar: Array<import('../../alpha-lab/regimes/regime-types').MarketRegime> = candles.map((c, i) => {
    const window = candles.slice(Math.max(0, i - config.lookback), i + 1);
    return classifyRegime(
      { market: config.symbol, timeframe: config.timeframe, lookback: config.lookback },
      window,
      rules,
    ).regime;
  });

  const report = evaluate({
    candles,
    trades,
    labels: labels.map((l, i) => ({ ...l, entryIdx: config.lookback + i })),
    steps: result.steps,
    regimesPerBar,
  });

  const output = {
    experimentId: config.experimentId,
    symbol: config.symbol,
    timeframe: config.timeframe,
    dataSource: source,
    overall: report.overall,
    byRegime: report.byRegime,
    byMonth: report.byMonth,
    byVolatilityBucket: report.byVolatilityBucket,
  };

  if (opts.json || opts.output) {
    writeOutput(output, opts.output, opts.json);
    return;
  }

  logger.info(`Report: ${config.experimentId}`);
  logger.info(`Symbol: ${config.symbol} | TF: ${config.timeframe} | Source: ${source}`);
  logger.info('');
  logger.info('Overall:');
  const o = report.overall;
  logger.info(`  Trades: ${o.totalTrades} (${o.winningTrades}W / ${o.losingTrades}L)`);
  logger.info(`  Win Rate: ${(o.winRate * 100).toFixed(1)}% | Profit Factor: ${o.profitFactor.toFixed(2)}`);
  logger.info(`  Sharpe: ${o.sharpeRatio.toFixed(2)} | Max DD: ${(o.maxDrawdown * 100).toFixed(1)}%`);
  logger.info(`  Net PnL: ${o.totalNetPnl.toFixed(4)}`);

  if (report.byRegime.length > 0) {
    logger.info('');
    logger.info('By Regime:');
    printTable(
      ['Regime', 'Trades', 'Win%', 'NetPnL'],
      report.byRegime.map((r) => [
        r.regime,
        String(r.numTrades),
        (r.winRate * 100).toFixed(1) + '%',
        r.netPnl.toFixed(4),
      ]),
    );
  }

  if (report.byMonth.length > 0) {
    logger.info('');
    logger.info('By Month:');
    printTable(
      ['Month', 'Trades', 'Win%', 'NetPnL'],
      report.byMonth.map((m) => [
        m.month,
        String(m.numTrades),
        (m.winRate * 100).toFixed(1) + '%',
        m.netPnl.toFixed(4),
      ]),
    );
  }

  if (report.byVolatilityBucket.length > 0) {
    logger.info('');
    logger.info('By Volatility Bucket:');
    printTable(
      ['Bucket', 'Trades', 'Win%', 'NetPnL'],
      report.byVolatilityBucket.map((v) => [
        v.bucket,
        String(v.numTrades),
        (v.winRate * 100).toFixed(1) + '%',
        v.netPnl.toFixed(4),
      ]),
    );
  }

  logger.info('');
}