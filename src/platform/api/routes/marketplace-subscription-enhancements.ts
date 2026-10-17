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
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { getTenantId, getUserId } from './marketplace-strategy-helpers';
import {
  autoRenewSchema,
  verifyAccess,
  parseUsageDays,
  formatStatusHistoryRow,
  formatCurrentUsage,
  formatUsageSnapshotRow,
} from './marketplace-subscription-enhancements-helpers';

export const marketplaceSubscriptionEnhancementsRouter: RouterType = Router();

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
        history: history.rows.map((r: Record<string, unknown>) => formatStatusHistoryRow(r)),
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
      const days = parseUsageDays(req.query.days);

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

      const curr = current.rows[0] as Record<string, unknown> | undefined;

      return res.json({
        subscriptionId,
        current: formatCurrentUsage(curr),
        snapshots: snapshots.rows.map((r: Record<string, unknown>) => formatUsageSnapshotRow(r)),
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
