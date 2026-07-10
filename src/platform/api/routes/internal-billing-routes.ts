/**
 * Internal Billing Dogfood Endpoints
 *
 * Operators / internal accounts inspect usage snapshots here.
 * Protected by a shared secret header — no public auth flow required.
 */

import { Router, Request, Response } from 'express';
import { usageMetering } from '@platform/signals-api/usage-metering-service';

export const internalBillingRouter: Router = Router();

const INTERNAL_KEY = process.env.INTERNAL_BILLING_KEY;

function requireInternalKey(req: Request, res: Response, next: Function): void {
  const provided = req.header('X-Internal-Key');
  if (!INTERNAL_KEY || provided !== INTERNAL_KEY) {
    res.status(401).json({ error: 'Internal API key required' });
    return;
  }
  next();
}

/**
 * GET /api/v1/internal/billing/usage
 *
 * Query:    ?subscriberId= (required)
 * Headers:  X-Internal-Key: <secret>
 * Response: { subscriberId, period, callsThisPeriod, periodLimit, overage, overageCost }
 */
internalBillingRouter.get('/usage', requireInternalKey, async (req: Request, res: Response) => {
  try {
    const subscriberId = req.query.subscriberId;

    if (typeof subscriberId !== 'string' || subscriberId.trim() === '') {
      return res.status(400).json({ error: 'subscriberId required' });
    }

    const snapshot = await usageMetering.getSnapshot(subscriberId);

    if (!snapshot) {
      return res.status(404).json({ error: 'No usage data for subscriber' });
    }

    return res.json({
      subscriberId: snapshot.subscriberId,
      period: snapshot.period,
      callsThisPeriod: snapshot.callsThisPeriod,
      periodLimit: snapshot.periodLimit,
      overage: snapshot.overageCalls,
      overageCost: 0, // tier lookup required for actual cost; leave 0 (needs subscriber tier)
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch usage snapshot' });
  }
});
