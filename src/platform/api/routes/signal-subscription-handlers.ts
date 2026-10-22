/**
 * Signal Subscription Routes - Core Subscription Handlers
 */

import { Request, Response } from 'express';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import { assertTenantAccess } from '../../../raas/subscriber-tenant-isolator';
import { requireAdminKey } from '../middleware/require-admin-key';
import { logger } from '../../../shared/utils/logger';
import { getCallerIdentity, denyUnlessAuthorized } from './signal-subscription-handler-support';

/**
 * GET /subscriptions/active — admin/internal only.
 *
 * Returns every tenant's active subscription, so it requires a resolved caller
 * identity. Non-admin callers get their own row instead of the full list.
 */
export async function handleListActiveSubscriptions(req: Request, res: Response): Promise<void> {
  try {
    const caller = getCallerIdentity(req);
    if (!caller) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }
    if (!requireAdminKey(req, res)) {
      return;
    }
    const subs = await signalSubscriberRepo.getActiveSubscriptions();
    res.json({ data: subs });
  } catch (err) {
    logger.error('[SignalSub] List active error', { err });
    res.status(500).json({ error: 'Failed to list subscriptions' });
  }
}

export async function handleGetTenantSubscription(req: Request, res: Response): Promise<void> {
  try {
    const caller = getCallerIdentity(req);
    if (!caller) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }
    const tenantId = req.params.tenantId as string;
    assertTenantAccess(tenantId, caller.subscriberId, false);
    const sub = await signalSubscriberRepo.getBySubscriberId(tenantId);
    if (!sub) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    res.json({ data: sub });
  } catch (err) {
    denyUnlessAuthorized(err, res, 'fetch subscription');
  }
}

/**
 * The self-service handlers (create, read, cancel own subscription, read own usage)
 * live in `signal-subscription-self-service-handlers.ts`. They are re-exported here so
 * the router keeps a single import site for the whole subscription surface.
 */
export {
  handleCreateSubscription,
  handleCancelCurrentSubscription,
  handleGetCurrentSubscription,
  handleGetUsageSnapshot,
} from './signal-subscription-self-service-handlers';

/**
 * DELETE /subscriptions/:id — cancel one subscription by id.
 *
 * Scans ALL active subscriptions to locate the row, so ownership must be
 * verified before cancelling: a caller may only cancel a subscription that
 * belongs to them, or any row when presenting a valid admin key.
 */
export async function handleCancelSubscription(req: Request, res: Response): Promise<void> {
  try {
    const caller = getCallerIdentity(req);
    if (!caller) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }

    const id = req.params.id as string;
    const active = await signalSubscriberRepo.getActiveSubscriptions();
    const target = active.find((s) => s.id === id);
    if (!target) {
      res.status(404).json({ error: 'Subscription not found or already cancelled' });
      return;
    }

    const owned = target.subscriberId === caller.subscriberId;
    if (!owned) {
      if (!requireAdminKey(req, res)) {
        return;
      }
    }

    // setActive() matches on subscriber_id, not the row's primary key.
    await signalSubscriberRepo.setActive(target.subscriberId, false);
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    logger.error('[SignalSub] Cancel error', { err });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

