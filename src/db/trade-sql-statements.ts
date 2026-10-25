/**
 * Trade SQL Statements
 *
 * Parameterized SQL catalogue and row mapping for the trades table. Keeping the
 * statements here leaves the repository classes as thin call-through facades and
 * makes the agreed upsert semantics reviewable in one place.
 *
 * Upsert semantics: id is the conflict key; a re-insert refreshes status, profit
 * and updated_at but never rewrites the immutable leg prices/fees.
 */

import type { ArbitrageOpportunity } from '../desk/arbitrage/spread-detector';
import type { ExecutionResult } from '../desk/execution/order-executor';

export interface TradeRecord {
  id: string;
  opportunity_id: string;
  execution_id: string;
  symbol: string;
  buy_exchange: string;
  sell_exchange: string;
  buy_price: number;
  sell_price: number;
  amount: number;
  spread_percent: number;
  profit: number;
  fee: number;
  status: string;
  created_at: number;
  updated_at: number;
}

export const TRADE_SQL = {
  upsert: `
      INSERT INTO trades (
        id, opportunity_id, execution_id, symbol,
        buy_exchange, sell_exchange,
        buy_price, sell_price, amount,
        spread_percent, profit, fee,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        profit = EXCLUDED.profit,
        updated_at = EXCLUDED.updated_at
    `,
  getById: 'SELECT * FROM trades WHERE id = $1',
  getByStatus: 'SELECT * FROM trades WHERE status = $1 ORDER BY created_at DESC',
  getRecent: 'SELECT * FROM trades ORDER BY created_at DESC LIMIT $1',
  getRecentPaged: `
      SELECT * FROM trades
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
  updateStatus: `
      UPDATE trades
      SET status = $1,
          profit = COALESCE($2, profit),
          updated_at = $3
      WHERE id = $4
    `,
  getTotalPnl: 'SELECT SUM(profit) as total FROM trades WHERE status = $1',
  getPnlByDateRange: `
      SELECT
        DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000)) as date,
        SUM(profit) as profit,
        COUNT(*) as trade_count
      FROM trades
      WHERE created_at BETWEEN $1 AND $2
        AND status = 'FILLED'
      GROUP BY DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000))
      ORDER BY date
    `,
  deleteOlderThan: 'DELETE FROM trades WHERE created_at < $1',
} as const;

/** Build the 14 parameter values for TRADE_SQL.upsert from an executed opportunity. */
export function toUpsertParams(
  opportunity: ArbitrageOpportunity,
  execution: ExecutionResult,
  updatedAt: number,
): unknown[] {
  return [
    execution.id,
    opportunity.id,
    execution.id,
    opportunity.symbol,
    opportunity.buyExchange,
    opportunity.sellExchange,
    opportunity.buyPrice,
    opportunity.sellPrice,
    execution.buyOrder?.amount || 0,
    opportunity.spreadPercent,
    execution.profit || 0,
    (execution.buyOrder?.fee || 0) + (execution.sellOrder?.fee || 0),
    execution.status,
    execution.timestamp,
    updatedAt,
  ];
}

/** A daily PnL bucket as returned by TRADE_SQL.getPnlByDateRange. */
export interface DailyPnlBucket {
  date: string;
  profit: number;
  tradeCount: number;
}

/** Row column type accepted from a pg query result row. */
type PgScalar = string | number | boolean | Date | null | undefined | unknown[] | Record<string, unknown>;

/** Map a DATE_TRUNC aggregate row (numeric columns arrive as strings) to a bucket. */
export function toDailyPnlBucket(row: { [key: string]: PgScalar }): DailyPnlBucket {
  return {
    date: String(row.date ?? ''),
    profit: parseFloat(String(row.profit ?? '0')),
    tradeCount: parseInt(String(row.trade_count ?? '0')),
  };
}
