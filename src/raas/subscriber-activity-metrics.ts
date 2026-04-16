/**
 * Subscriber Activity Metrics
 * Signals count, fills count, blocked-DLP count for a subscriber.
 * Provides the KPI cards shown on the overview page.
 */

import { buildTenantFilter, tenantQuery } from './subscriber-tenant-isolator';

export interface SubscriberActivityMetrics {
  subscriberId: string;
  activeSignalsCount: number;
  totalFillsCount: number;
  blockedDlpCount: number;
  pendingOrdersCount: number;
  lastActivityMs: number | null;
}

interface SignalCountRow extends Record<string, string | number | boolean | null | undefined> {
  active_signals: string;
}

interface TradeCountRow extends Record<string, string | number | boolean | null | undefined> {
  fills: string;
  blocked: string;
  pending: string;
  last_ts: string;
}

export class SubscriberActivityMetricsService {
  /**
   * Fetch all KPI counts for a subscriber in parallel.
   */
  async getMetrics(subscriberId: string): Promise<SubscriberActivityMetrics> {
    const [signalData, tradeData] = await Promise.all([
      this.fetchSignalCounts(subscriberId),
      this.fetchTradeCounts(subscriberId),
    ]);

    return {
      subscriberId,
      activeSignalsCount: signalData.activeSignalsCount,
      totalFillsCount: tradeData.fillsCount,
      blockedDlpCount: tradeData.blockedCount,
      pendingOrdersCount: tradeData.pendingCount,
      lastActivityMs: tradeData.lastActivityMs,
    };
  }

  private async fetchSignalCounts(subscriberId: string): Promise<{ activeSignalsCount: number }> {
    try {
      const filter = buildTenantFilter(subscriberId, 1);
      const sql = `
        SELECT COUNT(*) AS active_signals
        FROM signals
        WHERE status = 'ACTIVE'
        /*TENANT*/
      `;
      const { rows } = await tenantQuery<SignalCountRow>(sql, [], filter);
      return { activeSignalsCount: parseInt(rows[0]?.active_signals ?? '0', 10) };
    } catch {
      // signals table may not have subscriber_id yet — return 0 gracefully
      return { activeSignalsCount: 0 };
    }
  }

  private async fetchTradeCounts(subscriberId: string): Promise<{
    fillsCount: number;
    blockedCount: number;
    pendingCount: number;
    lastActivityMs: number | null;
  }> {
    const filter = buildTenantFilter(subscriberId, 1);
    const sql = `
      SELECT
        COUNT(CASE WHEN status = 'FILLED' THEN 1 END) AS fills,
        COUNT(CASE WHEN status = 'DLP_BLOCKED' THEN 1 END) AS blocked,
        COUNT(CASE WHEN status = 'PENDING' THEN 1 END) AS pending,
        MAX(created_at) AS last_ts
      FROM trades
      WHERE 1=1
      /*TENANT*/
    `;
    const { rows } = await tenantQuery<TradeCountRow>(sql, [], filter);
    const row = rows[0];
    const lastTs = row?.last_ts ? parseInt(row.last_ts, 10) : null;

    return {
      fillsCount: parseInt(row?.fills ?? '0', 10),
      blockedCount: parseInt(row?.blocked ?? '0', 10),
      pendingCount: parseInt(row?.pending ?? '0', 10),
      lastActivityMs: lastTs && !isNaN(lastTs) ? lastTs : null,
    };
  }
}
