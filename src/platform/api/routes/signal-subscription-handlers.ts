/**
 * Signal Subscription Routes - Core Subscription Handlers
 */

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { signalSubscriberRepo } from '../../signal/signal-subscriber-repository-d1';
import { usageMetering } from '../../signals-api/usage-metering-service';
import { resolveSubscriberId } from '../../middleware/signal-tier-resolver';
import { assertTenantAccess } from '../../../raas/subscriber-tenant-isolator';
import { requireAdminKey } from '../middleware/require-admin-key';
import { logger } from '../../../shared/utils/logger';
import { subscribeBodySchema } from './signal-subscription-types';

/**
 * Pull the caller's subscriber identity out of the request so tenant-scoped
 * handlers can verify ownership before touching any tenant's row. Returns null
 * when no bearer token is present at all.
 */
function getCallerIdentity(req: Request): { subscriberId: string } | null {
  const identity = resolveSubscriberId(req);
  if (!identity) return null;
  return { subscriberId: identity.subscriberId };
}

/**
 * Map a tenant-isolator denial onto a response. The isolator throws with a
 * stable message prefix, so 403 is returned only for genuine access denials.
 */
function denyUnlessAuthorized(err: unknown, res: Response, context: string): void {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('cross-tenant') || message.includes('no subscriber identity')) {
    res.status(403).json({ error: message });
    return;
  }
  logger.error(`[SignalSub] ${context} error`, { err });
  res.status(500).json({ error: `Failed to ${context}` });
}

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

/**
 * DELETE /subscription — self-service cancel for the authenticated caller.
 * No id parameter: resolves the caller's own active subscription.
 */
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
