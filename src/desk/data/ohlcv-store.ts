/**
 * OHLCV Store
 *
 * Persists and queries historical Open-High-Low-Close-Volume candle data
 * in PostgreSQL. Supports bulk inserts and efficient range queries for
 * backtesting without live API dependency.
 */

import { getDbClient } from '../../db/postgres-client';
import { logger } from '../../shared/utils/logger';

export interface OhlcvCandle {
  market: string;
  exchange: string;
  timeframe: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DbRow {
  market: string;
  exchange: string;
  timeframe: string;
  timestamp: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

/**
 * Store a single candle — upserts on conflict
 */
export async function storeCandle(candle: OhlcvCandle): Promise<void> {
  const pool = getDbClient();
  await pool.query(
    `INSERT INTO ohlcv_candles
       (market, exchange, timeframe, timestamp, open, high, low, close, volume)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (market, exchange, timeframe, timestamp) DO UPDATE SET
       open = EXCLUDED.open,
       high = EXCLUDED.high,
       low = EXCLUDED.low,
       close = EXCLUDED.close,
       volume = EXCLUDED.volume`,
    [
      candle.market,
      candle.exchange,
      candle.timeframe,
      candle.timestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume,
    ],
  );
}

/**
 * Bulk insert candles — upserts on conflict. Uses batched values for efficiency.
 */
export async function bulkInsertCandles(candles: OhlcvCandle[]): Promise<number> {
  if (candles.length === 0) return 0;

  const pool = getDbClient();
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < candles.length; i += BATCH_SIZE) {
    const batch = candles.slice(i, i + BATCH_SIZE);
    const values: (string | number | Date)[] = [];
    const placeholders: string[] = [];

    batch.forEach((candle, idx) => {
      const offset = idx * 9;
      placeholders.push(
        `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},` +
        `$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9})`,
      );
      values.push(
        candle.market,
        candle.exchange,
        candle.timeframe,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
      );
    });

    await pool.query(
      `INSERT INTO ohlcv_candles
         (market, exchange, timeframe, timestamp, open, high, low, close, volume)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (market, exchange, timeframe, timestamp) DO UPDATE SET
         open = EXCLUDED.open,
         high = EXCLUDED.high,
         low = EXCLUDED.low,
         close = EXCLUDED.close,
         volume = EXCLUDED.volume`,
      values,
    );

    inserted += batch.length;
  }

  logger.info(`[OHLCV] Bulk inserted ${inserted} candles`, 'OhlcvStore');
  return inserted;
}

/**
 * Get historical candle data for a market+timeframe within a date range
 */
export async function getHistoricalData(
  market: string,
  timeframe: string,
  start: Date,
  end: Date,
  exchange = 'polymarket',
): Promise<OhlcvCandle[]> {
  const pool = getDbClient();
  const result = await pool.query<DbRow>(
    `SELECT market, exchange, timeframe, timestamp, open, high, low, close, volume
     FROM ohlcv_candles
     WHERE market = $1 AND timeframe = $2 AND exchange = $3
       AND timestamp >= $4 AND timestamp <= $5
     ORDER BY timestamp ASC`,
    [market, timeframe, exchange, start, end],
  );

  return result.rows.map(parseRow);
}

/**
 * Get the latest N candles for a market+timeframe
 */
export async function getLatestCandles(
  market: string,
  timeframe: string,
  limit: number,
  exchange = 'polymarket',
): Promise<OhlcvCandle[]> {
  const pool = getDbClient();
  const result = await pool.query<DbRow>(
    `SELECT market, exchange, timeframe, timestamp, open, high, low, close, volume
     FROM ohlcv_candles
     WHERE market = $1 AND timeframe = $2 AND exchange = $3
     ORDER BY timestamp DESC
     LIMIT $4`,
    [market, timeframe, exchange, limit],
  );

  return result.rows.map(parseRow).reverse();
}

/**
 * Get count of stored candles for a market+timeframe
 */
export async function getCandleCount(
  market: string,
  timeframe: string,
  exchange = 'polymarket',
): Promise<number> {
  const pool = getDbClient();
  const result = await pool.query<{ cnt: string }>(
    `SELECT COUNT(*)::text as cnt
     FROM ohlcv_candles
     WHERE market = $1 AND timeframe = $2 AND exchange = $3`,
    [market, timeframe, exchange],
  );
  return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

function parseRow(row: DbRow): OhlcvCandle {
  return {
    market: row.market,
    exchange: row.exchange,
    timeframe: row.timeframe,
    timestamp: row.timestamp,
    open: parseFloat(row.open),
    high: parseFloat(row.high),
    low: parseFloat(row.low),
    close: parseFloat(row.close),
    volume: parseFloat(row.volume),
  };
}
