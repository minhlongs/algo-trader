/**
 * Helpers, schemas, and response formatters for Marketplace Subscription Enhancement Routes.
 */
import type { Request } from 'express';
import { z } from 'zod';
import { getDbClient } from '../../../shared/db/postgres-client';
import { isAdmin } from './marketplace-strategy-helpers';

export const autoRenewSchema = z.object({ autoRenew: z.boolean() });

/**
 * Verify the requesting tenant owns the subscription (or is admin).
 */
export async function verifyAccess(
  subscriptionId: string,
  tenantId: string,
  req: Request,
): Promise<Record<string, unknown> | null> {
  const db = getDbClient();
  const result = await db.query(
    `SELECT id, tenant_id, status FROM marketplace_subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  if (result.rows.length === 0) return null;
  const sub = result.rows[0] as Record<string, unknown>;
  return isAdmin(req) || sub.tenant_id === tenantId ? sub : null;
}

export function parseUsageDays(rawDays: unknown): number {
  return Math.min(Math.max(parseInt((rawDays as string) || '30', 10) || 30, 1), 365);
}

export function formatStatusHistoryRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    previousStatus: r.previous_status,
    newStatus: r.new_status,
    reason: r.reason,
    changedBy: r.changed_by,
    changedAt: r.created_at,
  };
}

export function formatCurrentUsage(curr: Record<string, unknown> | undefined) {
  if (!curr) return null;
  return {
    signalsDelivered: Number(curr.total_signals_delivered ?? 0),
    executionErrors: Number(curr.total_execution_errors ?? 0),
    currentInvestmentUsd: Number(curr.current_investment_usd ?? 0),
    totalPnlUsd: Number(curr.total_pnl_usd ?? 0),
  };
}

export function formatUsageSnapshotRow(r: Record<string, unknown>) {
  return {
    date: r.snapshot_date,
    signalsDelivered: Number(r.signals_delivered ?? 0),
    executionErrors: Number(r.execution_errors ?? 0),
    allocationPercent: Number(r.allocation_percent ?? 0),
    currentInvestmentUsd: Number(r.current_investment_usd ?? 0),
    totalPnlUsd: Number(r.total_pnl_usd ?? 0),
    pnlTodayUsd: Number(r.pnl_today_usd ?? 0),
    winRateToday: r.win_rate_today as number | null,
    tradesToday: Number(r.trades_today ?? 0),
  };
}
