/**
 * Marketplace Subscription Stats Routes
 * Aggregated subscriber stats and billing info for marketplace subscriptions.
 *
 * Endpoints:
 *   GET   /api/v1/marketplace/subscriptions/stats          — Aggregated subscriber stats (PRO+)
 *   GET   /api/v1/marketplace/subscriptions/:id/billing-info — Billing period details
 */
import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import { logger } from '../../../shared/utils/logger';
import { requireTier } from '../../middleware/feature-gate';
import { getDbClient } from '../../../shared/db/postgres-client';
import { getTenantId, isAdmin } from './marketplace-strategy-helpers';

export const marketplaceSubscriptionStatsRouter: RouterType = Router();

/**
 * GET /stats — Aggregated subscriber stats for the current tenant
 */
marketplaceSubscriptionStatsRouter.get('/stats', requireTier('PRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const db = getDbClient();

    const [activeResult, pnlResult, billingResult, signalsResult] = await Promise.all([
      db.query(
        `SELECT COUNT(*) as cnt FROM marketplace_subscriptions
         WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      ),
      db.query(
        `SELECT
          COALESCE(SUM(total_pnl_usd), 0) as total_pnl,
          COALESCE(SUM(current_investment_usd), 0) as total_invested
         FROM marketplace_subscriptions
         WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      ),
      db.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE auto_renew = true) as auto_renew_count,
          COUNT(*) FILTER (WHERE auto_renew = false) as manual_count
         FROM marketplace_subscriptions
         WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      ),
      db.query(
        `SELECT
          COALESCE(SUM(total_signals_delivered), 0) as signals,
          COALESCE(SUM(total_execution_errors), 0) as errors
         FROM marketplace_subscriptions
         WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    const active = Number((activeResult.rows[0] as Record<string, unknown>).cnt ?? 0);
    const pnl = pnlResult.rows[0] as Record<string, unknown>;
    const billing = billingResult.rows[0] as Record<string, unknown>;
    const signals = signalsResult.rows[0] as Record<string, unknown>;

    return res.json({
      activeSubscriptions: active,
      totalPnlUsd: Number(pnl.total_pnl ?? 0),
      totalInvestedUsd: Number(pnl.total_invested ?? 0),
      autoRenewCount: Number(billing.auto_renew_count ?? 0),
      manualCount: Number(billing.manual_count ?? 0),
      totalSignalsDelivered: Number(signals.signals ?? 0),
      totalExecutionErrors: Number(signals.errors ?? 0),
    });
  } catch (error) {
    logger.error('[SubStats] Error fetching stats', { error });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch subscription stats' });
  }
});

/**
 * Verify subscription access. Returns sub data or null.
 */
async function verifyAccess(subscriptionId: string, tenantId: string, req: Request) {
  const db = getDbClient();
  const result = await db.query(
    `SELECT id, tenant_id, status, strategy_id, listing_id, auto_renew,
            allocation_percent, current_investment_usd, total_pnl_usd,
            next_billing_date, current_billing_period_start,
            current_billing_period_end, subscription_started_at
     FROM marketplace_subscriptions WHERE id = $1`,
    [subscriptionId],
  );
  if (result.rows.length === 0) return null;
  const sub = result.rows[0] as Record<string, unknown>;
  const authorized = isAdmin(req) || sub.tenant_id === tenantId;
  return authorized ? sub : null;
}

/**
 * GET /:id/billing-info — Get billing period details for a subscription
 */
marketplaceSubscriptionStatsRouter.get('/:id/billing-info', requireTier('FREE'), async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id as string;
    const tenantId = getTenantId(req);

    const sub = await verifyAccess(subscriptionId, tenantId, req);
    if (!sub) {
      return res.status(404).json({ error: 'Not found', message: 'Subscription not found or access denied' });
    }

    const db = getDbClient();
    const listingResult = await db.query(
      `SELECT price_usd_monthly, billing_cycle FROM marketplace_listings WHERE id = $1`,
      [sub.listing_id],
    );
    const listing = listingResult.rows[0] as Record<string, unknown> | undefined;

    return res.json({
      subscriptionId,
      subscriptionStartedAt: sub.subscription_started_at,
      autoRenew: sub.auto_renew ?? true,
      currentBillingPeriodStart: sub.current_billing_period_start,
      currentBillingPeriodEnd: sub.current_billing_period_end,
      nextBillingDate: sub.next_billing_date,
      priceUsdMonthly: listing ? Number(listing.price_usd_monthly ?? 0) : null,
      billingCycle: listing ? (listing.billing_cycle as string) : null,
      status: sub.status,
      allocationPercent: Number(sub.allocation_percent ?? 0),
      currentInvestmentUsd: Number(sub.current_investment_usd ?? 0),
    });
  } catch (error) {
    logger.error('[SubStats] Error fetching billing info', { error, subId: req.params.id });
    return res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch billing info' });
  }
});
