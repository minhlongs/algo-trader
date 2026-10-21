/**
 * Trade Repository
 * Database operations for trades
 */

import { query } from './postgres-client';
import { ExecutionResult } from '../desk/execution/order-executor';
import { ArbitrageOpportunity } from '../desk/arbitrage/spread-detector';
import {
  TRADE_SQL,
  TradeRecord,
  toDailyPnlBucket,
  toUpsertParams,
} from './trade-sql-statements';

export type { TradeRecord };

export class TradeRepository {
  /**
   * Insert trade record
   */
  async insert(
    opportunity: ArbitrageOpportunity,
    execution: ExecutionResult
  ): Promise<void> {
    await query(TRADE_SQL.upsert, toUpsertParams(opportunity, execution, Date.now()));
  }

  /**
   * Get trade by ID
   */
  async getById(id: string): Promise<TradeRecord | null> {
    const result = await query(TRADE_SQL.getById, [id]);
    return (result.rows[0] as unknown as TradeRecord) || null;
  }

  /**
   * Get trades by status
   */
  async getByStatus(status: string): Promise<TradeRecord[]> {
    const result = await query(TRADE_SQL.getByStatus, [status]);
    return result.rows as unknown as TradeRecord[];
  }

  /**
   * Get recent trades
   */
  async getRecent(limit = 100, offset = 0): Promise<TradeRecord[]> {
    const sql = offset > 0 ? TRADE_SQL.getRecentPaged : TRADE_SQL.getRecent;
    const result = await query(sql, offset > 0 ? [limit, offset] : [limit]);
    return result.rows as unknown as TradeRecord[];
  }

  /**
   * Update trade status
   */
  async updateStatus(id: string, status: string, profit?: number): Promise<void> {
    await query(TRADE_SQL.updateStatus, [status, profit, Date.now(), id]);
  }

  /**
   * Get total PnL
   */
  async getTotalPnl(): Promise<number> {
    const result = await query<{ total: string }>(TRADE_SQL.getTotalPnl, ['FILLED']);
    return parseFloat(result.rows[0]?.total || '0');
  }

  /**
   * Get PnL by date range
   */
  async getPnlByDateRange(
    startDate: number,
    endDate: number
  ): Promise<{ date: string; profit: number; tradeCount: number }[]> {
    const result = await query(TRADE_SQL.getPnlByDateRange, [startDate, endDate]);
    return result.rows.map((row) => toDailyPnlBucket(row));
  }

  /**
   * Delete old trades
   */
  async deleteOlderThan(timestamp: number): Promise<void> {
    await query(TRADE_SQL.deleteOlderThan, [timestamp]);
  }
}
