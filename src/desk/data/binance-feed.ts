import { bulkInsertCandles, type OhlcvCandle } from '../data/ohlcv-store';
import { logger } from '../../shared/utils/logger';
import { requireBinanceSymbol, MAX_PER_REQUEST, DELAY_MS, sleep } from './binance-feed-types';
import { intervalToMs, fetchKlinesPage, klineToCandle } from './binance-feed-helpers';

export * from './binance-feed-types';

export async function fetchBinanceHistory(
  symbol: string,
  days: number,
  onProgress?: (fetched: number) => void,
  timeframe = '1h'
): Promise<number> {
  const binanceSymbol = requireBinanceSymbol(symbol);
  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;

  logger.info(`[BinanceFeed] Fetching ${days}d history for ${symbol} (${binanceSymbol}) @ ${timeframe}`);

  const candles: OhlcvCandle[] = [];
  let cursor = startTime;

  const intervalMs = intervalToMs(timeframe);
  while (cursor < endTime) {
    const pageEnd = Math.min(cursor + MAX_PER_REQUEST * intervalMs, endTime);
    try {
      const klines = await fetchKlinesPage(binanceSymbol, cursor, pageEnd, MAX_PER_REQUEST, timeframe);
      for (const k of klines) {
        candles.push(klineToCandle(symbol, k, timeframe));
      }
      onProgress?.(candles.length);
      logger.debug(`[BinanceFeed] Page: ${klines.length} candles, cursor ${new Date(cursor).toISOString()}`);
    } catch (err) {
      logger.error('[BinanceFeed] Page fetch failed', {
        symbol,
        cursor: new Date(cursor).toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    cursor = pageEnd;
    if (cursor < endTime) {
      await sleep(DELAY_MS);
    }
  }

  if (candles.length === 0) {
    logger.warn(`[BinanceFeed] No candles returned for ${symbol}`);
    return 0;
  }

  candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const stored = await bulkInsertCandles(candles);
  logger.info(`[BinanceFeed] Stored ${stored} candles for ${symbol} (${binanceSymbol})`);
  return stored;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const symbol = args[0] ?? 'BTC/USD';
  const days = parseInt(args[1] ?? '30', 10);
  const timeframe = args[2] ?? '1h';

  fetchBinanceHistory(symbol, days, (n) => {
    process.stdout.write(`\r[BinanceFeed] Fetched ${n} candles...`);
  }, timeframe)
    .then((stored) => {
      process.stdout.write('\n');
      logger.info(`[BinanceFeed] Done: ${stored} candles stored for ${symbol}`);
      process.exit(0);
    })
    .catch((err) => {
      process.stdout.write('\n');
      logger.error('[BinanceFeed] Fatal', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}
