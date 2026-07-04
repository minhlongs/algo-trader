/**
 * Subscriber P&L REST Routes
 * GET /api/v1/subscriber/:id/pnl        — lifetime P&L summary
 * GET /api/v1/subscriber/:id/equity     — equity curve time-series
 * GET /api/v1/subscriber/:id/activity   — KPI counts (signals, fills, DLP)
 * GET /api/v1/subscriber/:id/trades     — daily P&L breakdown
 *
 * Auth: Bearer JWT required. Non-admin callers may only access their own :id.
 * Tenant isolation: all queries go through subscriber-tenant-isolator.
 */

import { Router, Request, Response } from 'express';
import { SubscriberPnLAggregator } from '../../raas/subscriber-pnl-aggregator';
import { SubscriberEquityCurveBuilder } from '../../raas/subscriber-equity-curve-builder';
import { SubscriberActivityMetricsService } from '../../raas/subscriber-activity-metrics';
import { assertTenantAccess } from '../../raas/subscriber-tenant-isolator';

export const subscriberPnlRouter: Router = Router();

const pnlAggregator = new SubscriberPnLAggregator();
const equityBuilder = new SubscriberEquityCurveBuilder();
const activityService = new SubscriberActivityMetricsService();

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_MS = 30 * DAY_MS;

/** Extract subscriberId + admin flag from Bearer JWT claims (set by auth middleware). */
function extractTokenClaims(req: Request): {
  tokenSubscriberId: string | null;
  isAdmin: boolean;
} {
  // Real JWT parsing done upstream by license-validation middleware.
  // Claims attached to req as (req as any).claims — standard Express pattern.
  const claims = (req as Request & { claims?: { sub?: string; role?: string } }).claims;
  return {
    tokenSubscriberId: claims?.sub ?? null,
    isAdmin: claims?.role === 'admin',
  };
}

function parseRange(req: Request): { fromMs: number; toMs: number } {
  const toMs = Date.now();
  const rangeMs = parseInt(req.query.rangeMs as string || String(DEFAULT_RANGE_MS), 10);
  return { fromMs: toMs - Math.abs(rangeMs), toMs };
}

/** GET /subscriber/:id/pnl */
subscriberPnlRouter.get('/:id/pnl', async (req: Request, res: Response): Promise<void> => {
  const subscriberId = String(req.params.id ?? '');
  try {
    const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
    assertTenantAccess(subscriberId, tokenSubscriberId, isAdmin);

    const summary = await pnlAggregator.getSummary(subscriberId);
    res.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
      res.status(403).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

/** GET /subscriber/:id/equity */
subscriberPnlRouter.get('/:id/equity', async (req: Request, res: Response): Promise<void> => {
  const subscriberId = String(req.params.id ?? '');
  try {
    const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
    assertTenantAccess(subscriberId, tokenSubscriberId, isAdmin);

    const { fromMs, toMs } = parseRange(req);
    const startingCapital = parseFloat(req.query.capital as string || '10000');

    const curve = await equityBuilder.build(subscriberId, fromMs, toMs, startingCapital);
    res.json(curve);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
      res.status(403).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

/** GET /subscriber/:id/activity */
subscriberPnlRouter.get('/:id/activity', async (req: Request, res: Response): Promise<void> => {
  const subscriberId = String(req.params.id ?? '');
  try {
    const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
    assertTenantAccess(subscriberId, tokenSubscriberId, isAdmin);

    const metrics = await activityService.getMetrics(subscriberId);
    res.json(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
      res.status(403).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

/** GET /subscriber/:id/trades — daily P&L breakdown */
subscriberPnlRouter.get('/:id/trades', async (req: Request, res: Response): Promise<void> => {
  const subscriberId = String(req.params.id ?? '');
  try {
    const { tokenSubscriberId, isAdmin } = extractTokenClaims(req);
    assertTenantAccess(subscriberId, tokenSubscriberId, isAdmin);

    const { fromMs, toMs } = parseRange(req);
    const breakdown = await pnlAggregator.getDailyBreakdown(subscriberId, fromMs, toMs);
    res.json({ subscriberId, breakdown });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
      res.status(403).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});
