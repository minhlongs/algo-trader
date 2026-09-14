/**
 * Database storage methods for Subscriber Executor.
 */

import { query } from '../../shared/db/postgres-client.js';
import { buildTenantFilter } from './subscriber-tenant-isolator';
import type { RecordTradeParams, TradeInsertRow } from './subscriber-executor-types';

export async function recordTrade(params: RecordTradeParams): Promise<void> {
  const sql = `
    INSERT INTO trades (
      id, subscriber_id, attestation_id, opportunity_id, execution_id,
      symbol, buy_exchange, sell_exchange,
      buy_price, sell_price, amount,
      spread_percent, profit, fee,
      status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      profit = EXCLUDED.profit,
      updated_at = EXCLUDED.updated_at
  `;

  await query(sql, [
    params.tradeId,
    params.subscriberId,
    params.attestationId,
    params.strategyId,       // opportunity_id = strategy for RaaS trades
    params.tradeId,           // execution_id same as trade id
    params.strategyId,        // symbol
    'raas',                   // buy_exchange
    'raas',                   // sell_exchange
    params.capitalUsdt,       // buy_price
    params.capitalUsdt,       // sell_price
    1,                        // amount
    0,                        // spread_percent
    params.profit,
    0,                        // fee
    params.status,
    params.executedAtMs,
    params.executedAtMs,
  ]);
}

export async function fetchRecentExecutions(
  subscriberId: string,
  limit = 50
): Promise<TradeInsertRow[]> {
  const filter = buildTenantFilter(subscriberId, 2);
  const sql = `
    SELECT id FROM trades
    WHERE created_at >= $1
    ${filter.clause}
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 500)}
  `;
  const result = await query(sql, [Date.now() - 30 * 86400000, filter.subscriberId]);
  return result.rows as TradeInsertRow[];
}
