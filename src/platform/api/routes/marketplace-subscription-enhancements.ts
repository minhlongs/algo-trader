/**
 * Marketplace Subscription Enhancement Routes
 * Status history, usage tracking, and auto-renewal management.
 *
 * Endpoints:
 *   GET    /:id/status-history  — Status change history
 *   GET    /:id/usage           — Usage stats and daily snapshots
 *   PATCH  /:id/auto-renewal    — Toggle auto-renewal
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { z } from 'zod';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { getTenantId, getUserId, isAdmin } from './marketplace-strategy-helpers';

export const marketplaceSubscriptionEnhancementsRouter: RouterType = Router();

const autoRenewSchema = z.object({ autoRenew: z.boolean() });

/**
 * Verify the requesting tenant owns the subscription (or is admin).
 */
async function verifyAccess(subscriptionId: string, tenantId: string, req: Request) {
  const db = getDbClient();
  const result = await db.query(
    `SELECT id, tenant_id, status FROM marketplace_subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  if (result.rows.length === 0) return null;
  const sub = result.rows[0] as Record<string, unknown>;
  return isAdmin(req) || sub.tenant_id === tenantId ? sub : null;
}

/**
 * GET /:id/status-history — Status change history for a subscription
 */
marketplaceSubscriptionEnhancementsRouter.get(
  '/:id/status-history', requireTier('FREE'), async (req: Request, res: Response) => {
    try {
      const subscriptionId = req.params.id as string;
      const tenantId = getTenantId(req);

      const sub = await verifyAccess(subscriptionId, tenantId, req);
      if (!sub) {
        return res.status(404).json({ error: 'Not found', message: 'Subscription not found or access denied' });
      }

      const db = getDbClient();
      const history = await db.query(
        `SELECT id, previous_status, new_status, reason, changed_by, created_at
         FROM subscription_status_history
         WHERE subscription_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [subscriptionId],
      );

      return res.json({
        subscriptionId,
        history: history.rows.map((r: Record<string, unknown>) => ({
          id: r.id, previousStatus: r.previous_status, newStatus: r.new_status,
          reason: r.reason, changedBy: r.changed_by, changedAt: r.created_at,
        })),
      });
    } catch (error) {
      logger.error('[SubEnhance] Error fetching status history', { error, subId: req.params.id });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch status history' });
    }
  },
);

/**
 * GET /:id/usage — Usage stats and daily snapshots for a subscription
 */
marketplaceSubscriptionEnhancementsRouter.get(
  '/:id/usage', requireTier('FREE'), async (req: Request, res: Response) => {
    try {
      const subscriptionId = req.params.id as string;
      const tenantId = getTenantId(req);
      const days = Math.min(Math.max(parseInt((req.query.days as string) || '30', 10) || 30, 1), 365);

      const sub = await verifyAccess(subscriptionId, tenantId, req);
      if (!sub) {
        return res.status(404).json({ error: 'Not found', message: 'Subscription not found or access denied' });
      }

      const db = getDbClient();
      const [snapshots, current] = await Promise.all([
        db.query(
          `SELECT snapshot_date, signals_delivered, execution_errors,
                  allocation_percent, current_investment_usd, total_pnl_usd,
                  pnl_today_usd, win_rate_today, trades_today
           FROM subscription_usage_snapshots
           WHERE subscription_id = $1 AND snapshot_date >= CURRENT_DATE - $2::integer
           ORDER BY snapshot_date DESC`,
          [subscriptionId, days],
        ),
        db.query(
          `SELECT total_signals_delivered, total_execution_errors,
                  current_investment_usd, total_pnl_usd
           FROM marketplace_subscriptions WHERE id = $1`,
          [subscriptionId],
        ),
      ]);

      const curr = current.rows[0] as Record<string, unknown>;

      return res.json({
        subscriptionId,
        current: curr ? {
          signalsDelivered: Number(curr.total_signals_delivered ?? 0),
          executionErrors: Number(curr.total_execution_errors ?? 0),
          currentInvestmentUsd: Number(curr.current_investment_usd ?? 0),
          totalPnlUsd: Number(curr.total_pnl_usd ?? 0),
        } : null,
        snapshots: snapshots.rows.map((r: Record<string, unknown>) => ({
          date: r.snapshot_date,
          signalsDelivered: Number(r.signals_delivered ?? 0),
          executionErrors: Number(r.execution_errors ?? 0),
          allocationPercent: Number(r.allocation_percent ?? 0),
          currentInvestmentUsd: Number(r.current_investment_usd ?? 0),
          totalPnlUsd: Number(r.total_pnl_usd ?? 0),
          pnlTodayUsd: Number(r.pnl_today_usd ?? 0),
          winRateToday: r.win_rate_today as number | null,
          tradesToday: Number(r.trades_today ?? 0),
        })),
      });
    } catch (error) {
      logger.error('[SubEnhance] Error fetching usage', { error, subId: req.params.id });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch usage data' });
    }
  },
);

/**
 * PATCH /:id/auto-renewal — Toggle auto-renewal for a subscription
 */
marketplaceSubscriptionEnhancementsRouter.patch(
  '/:id/auto-renewal', requireTier('FREE'), async (req: Request, res: Response) => {
    try {
      const subscriptionId = req.params.id as string;
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const parsed = autoRenewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation error', details: parsed.error.issues });
      }

      const sub = await verifyAccess(subscriptionId, tenantId, req);
      if (!sub) {
        return res.status(404).json({ error: 'Not found', message: 'Subscription not found or access denied' });
      }

      const { autoRenew } = parsed.data;

      const db = getDbClient();
      await db.query(
        `UPDATE marketplace_subscriptions SET auto_renew = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [autoRenew, subscriptionId, tenantId],
      );

      // Record in status history
      await db.query(
        `INSERT INTO subscription_status_history
         (subscription_id, previous_status, new_status, reason, changed_by)
         VALUES ($1, $2, $2, $3, $4)`,
        [subscriptionId, sub.status, autoRenew ? 'Auto-renewal enabled' : 'Auto-renewal disabled', userId],
      );

      logger.info('[SubEnhance] Auto-renewal toggled', { subscriptionId, autoRenew, tenantId, userId });

      return res.json({
        id: subscriptionId,
        autoRenew,
        message: autoRenew
          ? 'Auto-renewal enabled. Your subscription will renew automatically.'
          : 'Auto-renewal disabled. Your subscription will expire at the end of the current billing period.',
      });
    } catch (error) {
      logger.error('[SubEnhance] Error toggling auto-renewal', { error, subId: req.params.id });
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to update auto-renewal' });
    }
  },
);
