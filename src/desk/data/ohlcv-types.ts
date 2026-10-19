/**
 * OHLCV Types and Row Parsing
 *
 * @module desk/data/ohlcv-types
 */

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

export interface DbRow {
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

export function parseOhlcvRow(row: DbRow): OhlcvCandle {
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
