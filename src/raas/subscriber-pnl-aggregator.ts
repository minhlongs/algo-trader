/**
 * Subscriber P&L Aggregator
 * Computes realized P&L, win rate, and daily summaries scoped to one subscriber.
 * All queries go through TenantIsolator — never raw SQL with subscriber_id inline.
 */

import { buildTenantFilter, tenantQuery } from './subscriber-tenant-isolator';

export interface SubscriberPnLSummary {
  subscriberId: string;
  totalRealizedPnl: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  profitFactor: number;
  blockedDlpCount: number;
}

export interface SubscriberDailyPnL {
  date: string;        // 'YYYY-MM-DD'
  netPnl: number;
  tradeCount: number;
  winRate: number;
}

interface TradeStatsRow {
  trade_count: string;
  win_count: string;
  loss_count: string;
  total_profit: string;
  total_loss: string;
  avg_win: string;
  avg_loss: string;
  best_trade: string;
  worst_trade: string;
  blocked_dlp: string;
}

interface DailyRow {
  day: string;
  net_pnl: string;
  trade_count: string;
  win_count: string;
}

export class SubscriberPnLAggregator {
  /**
   * Aggregate lifetime P&L stats for a single subscriber.
   */
  async getSummary(subscriberId: string): Promise<SubscriberPnLSummary> {
    const filter = buildTenantFilter(subscriberId, 1);

    const sql = `
      SELECT
        COUNT(*) AS trade_count,
        COUNT(CASE WHEN profit > 0 THEN 1 END) AS win_count,
        COUNT(CASE WHEN profit < 0 THEN 1 END) AS loss_count,
        SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) AS total_profit,
        SUM(CASE WHEN profit < 0 THEN -profit ELSE 0 END) AS total_loss,
        AVG(CASE WHEN profit > 0 THEN profit END) AS avg_win,
        AVG(CASE WHEN profit < 0 THEN -profit END) AS avg_loss,
        MAX(profit) AS best_trade,
        MIN(profit) AS worst_trade,
        COUNT(CASE WHEN status = 'DLP_BLOCKED' THEN 1 END) AS blocked_dlp
      FROM trades
      WHERE status IN ('FILLED', 'DLP_BLOCKED')
      /*TENANT*/
    `;

    const { rows } = await tenantQuery<TradeStatsRow>(sql, [], filter);
    const row = rows[0];

    const tradeCount = parseInt(row?.trade_count ?? '0', 10);
    const winCount = parseInt(row?.win_count ?? '0', 10);
    const lossCount = parseInt(row?.loss_count ?? '0', 10);
    const totalProfit = parseFloat(row?.total_profit ?? '0');
    const totalLoss = parseFloat(row?.total_loss ?? '0');

    return {
      subscriberId,
      totalRealizedPnl: totalProfit - totalLoss,
      tradeCount,
      winCount,
      lossCount,
      winRate: tradeCount > 0 ? winCount / tradeCount : 0,
      avgWin: parseFloat(row?.avg_win ?? '0'),
      avgLoss: parseFloat(row?.avg_loss ?? '0'),
      bestTrade: parseFloat(row?.best_trade ?? '0'),
      worstTrade: parseFloat(row?.worst_trade ?? '0'),
      profitFactor: totalLoss > 0 ? totalProfit / totalLoss : Infinity,
      blockedDlpCount: parseInt(row?.blocked_dlp ?? '0', 10),
    };
  }

  /**
   * Daily P&L breakdown for a subscriber within a date range.
   * @param fromMs  Unix ms start
   * @param toMs    Unix ms end
   */
  async getDailyBreakdown(
    subscriberId: string,
    fromMs: number,
    toMs: number
  ): Promise<SubscriberDailyPnL[]> {
    const filter = buildTenantFilter(subscriberId, 3);

    const sql = `
      SELECT
        DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000)) AS day,
        SUM(profit) AS net_pnl,
        COUNT(*) AS trade_count,
        COUNT(CASE WHEN profit > 0 THEN 1 END) AS win_count
      FROM trades
      WHERE created_at BETWEEN $1 AND $2
        AND status = 'FILLED'
      /*TENANT*/
      GROUP BY DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000))
      ORDER BY day
    `;

    const { rows } = await tenantQuery<DailyRow>(sql, [fromMs, toMs], filter);

    return rows.map((r) => {
      const tradeCount = parseInt(r.trade_count, 10);
      const winCount = parseInt(r.win_count, 10);
      return {
        date: String(r.day).split('T')[0],
        netPnl: parseFloat(r.net_pnl),
        tradeCount,
        winRate: tradeCount > 0 ? winCount / tradeCount : 0,
      };
    });
  }
}
