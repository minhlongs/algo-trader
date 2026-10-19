/**
 * GRU Strategy CLI Command
 *
 * Run GRU neural network trading strategy live or in backtest mode.
 */

import { GruStrategy } from '../strategies/GruStrategy';
import { logger } from '../../shared/utils/logger';
import {
  type GruCommandOptions,
  resolveGruConfig,
  generateMockData,
  generateMockCandle,
  sleep,
} from './gru-strategy-helpers';

export type { GruCommandOptions };
export { resolveGruConfig, generateMockData, generateMockCandle, sleep };

export async function runGruStrategy(options: Partial<GruCommandOptions> = {}): Promise<void> {
  const config = resolveGruConfig(options);

  logger.info('='.repeat(60));
  logger.info('  GRU Neural Network Trading Strategy');
  logger.info('='.repeat(60));
  logger.info(`Symbol: ${config.symbol} | Interval: ${config.interval} | Mode: ${config.mode.toUpperCase()}`);
  logger.info(`Input Steps: ${config.inputSteps} | GRU Units: ${config.gruUnits} | Epochs: ${config.epochs}`);
  logger.info(`Confidence Threshold: ${(config.confidenceThreshold * 100).toFixed(0)}%`);
  logger.info('='.repeat(60));

  try {
    const strategy = new GruStrategy({
      inputSteps: config.inputSteps,
      gruUnits: config.gruUnits,
      epochs: config.epochs,
      confidenceThreshold: config.confidenceThreshold,
    });

    logger.info('\n[1/3] Initializing GRU model...');
    await strategy.initialize();

    logger.info('\n[2/3] Loading historical data...');
    const historicalData = generateMockData(config.inputSteps + 20);
    logger.info(`Loaded ${historicalData.length} candles`);

    logger.info('\n[3/3] Training GRU model...');
    await strategy.train(historicalData);

    logger.info('\n' + '='.repeat(60) + '\n  Training Complete - Ready for Trading\n' + '='.repeat(60));

    if (config.mode === 'live') {
      logger.info('\n🔴 LIVE TRADING MODE - Simulated\nWatching for new candles...\n');

      for (let i = 0; i < 5; i++) {
        const newCandle = generateMockCandle(historicalData[historicalData.length - 1]);
        const signal = await strategy.execute([newCandle]);

        logger.info(`\n[${new Date().toISOString()}] ${config.symbol}`);
        logger.info(`  Price: $${newCandle.close.toFixed(2)} | Signal: ${signal.action.toUpperCase()}`);
        logger.info(`  Confidence: ${(signal.confidence * 100).toFixed(1)}% | Reason: ${signal.reason}`);

        await sleep(1000);
      }
    } else {
      logger.info('\n📊 BACKTEST MODE\nRunning on historical data...\n');

      let wins = 0;
      let losses = 0;

      for (let i = 20; i < historicalData.length; i++) {
        const inputCandles = historicalData.slice(i - config.inputSteps, i);
        const nextCandle = historicalData[i];
        const signal = await strategy.execute(inputCandles);

        if (signal.action !== 'wait') {
          const predictedUp = signal.action === 'buy';
          const actualUp = nextCandle.close > inputCandles[inputCandles.length - 1].close;

          if (predictedUp === actualUp) {
            wins++;
            logger.info(`✓ Candle ${i}: ${signal.action.toUpperCase()} - Correct!`);
          } else {
            losses++;
            logger.info(`✗ Candle ${i}: ${signal.action.toUpperCase()} - Wrong`);
          }
        }
      }

      logger.info('\n' + '='.repeat(60));
      logger.info('  Backtest Results');
      logger.info('='.repeat(60));
      logger.info(`Wins: ${wins}`);
      logger.info(`Losses: ${losses}`);
      logger.info(`Win Rate: ${((wins / (wins + losses)) * 100).toFixed(1)}%`);
    }

    // Cleanup
    strategy.dispose?.();

    logger.info('\n✅ GRU Strategy session complete.\n');
  } catch (error) {
    logger.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
