/**
 * Subscriber Equity Curve Builder
 * Produces time-series NAV (starting capital → current) per subscriber.
 * Reads from daily P&L aggregation and optional equity snapshots table.
 */

import { buildTenantFilter, tenantQuery } from './subscriber-tenant-isolator';

export interface EquityCurvePoint {
  date: string;    // 'YYYY-MM-DD'
  nav: number;     // cumulative NAV at end of day
  dailyPnl: number;
}

export interface EquityCurveResult {
  subscriberId: string;
  startingCapital: number;
  currentNav: number;
  totalReturn: number;     // % from starting capital
  maxDrawdown: number;     // peak-to-trough as fraction
  curve: EquityCurvePoint[];
}

interface DailyRow extends Record<string, string | number | boolean | null | undefined> {
  day: string;
  net_pnl: string;
}

const DEFAULT_STARTING_CAPITAL = 10_000;

function computeMaxDrawdown(navSeries: number[]): number {
  if (navSeries.length < 2) return 0;
  let peak = navSeries[0];
  let maxDd = 0;
  for (const nav of navSeries) {
    if (nav > peak) peak = nav;
    if (peak > 0) {
      const dd = (peak - nav) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

export class SubscriberEquityCurveBuilder {
  /**
   * Build equity curve for subscriber from fromMs to toMs.
   * @param startingCapital  Initial capital (default 10 000 USDT)
   */
  async build(
    subscriberId: string,
    fromMs: number,
    toMs: number,
    startingCapital = DEFAULT_STARTING_CAPITAL
  ): Promise<EquityCurveResult> {
    const filter = buildTenantFilter(subscriberId, 3);

    // Pull daily realized P&L aggregated by day
    const sql = `
      SELECT
        DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000)) AS day,
        SUM(profit) AS net_pnl
      FROM trades
      WHERE created_at BETWEEN $1 AND $2
        AND status = 'FILLED'
      /*TENANT*/
      GROUP BY DATE_TRUNC('day', TO_TIMESTAMP(created_at / 1000))
      ORDER BY day
    `;

    const { rows } = await tenantQuery<DailyRow>(sql, [fromMs, toMs], filter);

    // Build cumulative NAV curve
    let nav = startingCapital;
    const curve: EquityCurvePoint[] = rows.map((r) => {
      const dailyPnl = parseFloat(r.net_pnl ?? '0');
      nav += dailyPnl;
      return {
        date: String(r.day).split('T')[0],
        nav: parseFloat(nav.toFixed(8)),
        dailyPnl: parseFloat(dailyPnl.toFixed(8)),
      };
    });

    const navSeries = curve.map((p) => p.nav);
    const currentNav = navSeries.length > 0 ? navSeries[navSeries.length - 1] : startingCapital;
    const totalReturn = startingCapital > 0
      ? (currentNav - startingCapital) / startingCapital
      : 0;

    return {
      subscriberId,
      startingCapital,
      currentNav,
      totalReturn,
      maxDrawdown: computeMaxDrawdown([startingCapital, ...navSeries]),
      curve,
    };
  }
}
