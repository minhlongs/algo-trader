/**
 * Signal Subscription Routes - Self-Service Handlers
 *
 * The four routes an authenticated caller reaches with its own credentials only:
 * create, read, and cancel its own subscription, plus read its own usage. None of
 * them accepts a tenant identifier from the path, so each resolves the caller's
 * identity and works on that row alone — there is no cross-tenant surface here to
 * guard. `handleGetUsageSnapshot` is the one exception in form: it takes a
 * subscriberId from the path, so it calls `assertTenantAccess` before reading.
 *
 * Split from `signal-subscription-handlers.ts` so the route handlers stay under the
 * repository's 200-LOC ceiling.
 *
 * @module platform/api/routes/signal-subscription-self-service-handlers
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import { usageMetering } from '../../signals-api/usage-metering-service';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { assertTenantAccess } from '../../../raas/subscriber-tenant-isolator';
import { logger } from '../../../shared/utils/logger';
import { subscribeBodySchema } from './signal-subscription-types';
import { getCallerIdentity, denyUnlessAuthorized } from './signal-subscription-handler-support';

export async function handleCreateSubscription(req: Request, res: Response): Promise<void> {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }
  const parsed = subscribeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    return;
  }
  try {
    const { subscriberId, tier } = identity;
    const existing = await signalSubscriberRepo.getBySubscriberId(subscriberId);
    const now = Date.now();
    const sub = {
      id: existing?.id ?? randomUUID(),
      subscriberId,
      tier,
      active: true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await signalSubscriberRepo.upsert(sub);
    if (parsed.data.chatId != null) {
      await signalSubscriberRepo.upsert({ ...sub, chatId: parsed.data.chatId });
    }
    logger.info('[SignalSub] Subscription created/updated', { subscriberId, tier });
    res.json({ data: sub, message: 'Subscription updated' });
  } catch (err) {
    logger.error('[SignalSub] Create/update error', { err });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
}

export async function handleCancelCurrentSubscription(req: Request, res: Response): Promise<void> {
  try {
    const caller = getCallerIdentity(req);
    if (!caller) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }
    const own = await signalSubscriberRepo.getBySubscriberId(caller.subscriberId);
    if (!own || !own.active) {
      res.status(404).json({ error: 'No active subscription to cancel' });
      return;
    }
    // setActive() matches on subscriber_id, not the row's primary key.
    await signalSubscriberRepo.setActive(own.subscriberId, false);
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    logger.error('[SignalSub] Self-cancel error', { err });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
}

export async function handleGetCurrentSubscription(req: Request, res: Response): Promise<void> {
  const identity = resolveSubscriberId(req);
  if (!identity) {
    res.status(401).json({ error: 'Valid API key required' });
    return;
  }
  try {
    const sub = await signalSubscriberRepo.getBySubscriberId(identity.subscriberId);
    if (!sub) {
      res.status(404).json({ error: 'Not subscribed' });
      return;
    }
    res.json({ data: sub });
  } catch (err) {
    logger.error('[SignalSub] GET /subscription error', { err });
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
}

export async function handleGetUsageSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const caller = getCallerIdentity(req);
    if (!caller) {
      res.status(401).json({ error: 'Valid API key required' });
      return;
    }
    const subscriberId = req.params.subscriberId as string;
    if (!subscriberId || subscriberId.trim() === '') {
      res.status(400).json({ error: 'subscriberId required' });
      return;
    }

    assertTenantAccess(subscriberId, caller.subscriberId, false);

    const snapshot = await usageMetering.getSnapshot(subscriberId);
    if (!snapshot) {
      res.status(404).json({ error: 'No usage data for subscriber' });
      return;
    }

    res.json({
      subscriberId: snapshot.subscriberId,
      period: snapshot.period,
      callsThisPeriod: snapshot.callsThisPeriod,
      periodLimit: snapshot.periodLimit,
      overage: snapshot.overageCalls,
    });
  } catch (err) {
    denyUnlessAuthorized(err, res, 'fetch usage');
  }
}
